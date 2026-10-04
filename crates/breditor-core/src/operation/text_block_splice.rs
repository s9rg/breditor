//! Guarded text editing inside one direct-root paragraph or heading.

use super::{
    AppliedChange, AppliedOperation, ChildRange, FragmentRole, Operation, TextChange, TextRange,
    TextSpliceApplyError, TextSpliceMap, block_kind,
    text_splice::{
        build_result_children, container_length, extract_fragment, fragments_have_identical_text,
        validate_fragment, validate_range_boundary,
    },
};
use crate::{
    document::{Document, DocumentProofMismatch, ElementNode, NodeRef, PropertyMap, TextFragment},
    position::TextOffset,
    schema::ValidationReport,
    state::EditorContext,
};
use thiserror::Error;

/// Replaces a scalar-aligned UTF-16 range while preserving its block kind/rank.
///
/// The complete source block is an optimistic guard, including all inline
/// formats and the heading rank. Unrelated root siblings are not guarded.
/// This experimental primitive is deliberately separate from paragraph-only
/// `TextSplice`. V5 codecs preserve it; older codecs and the shipping browser
/// profile do not admit it.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TextBlockSplice {
    range: TextRange,
    expected: NodeRef,
    replacement: TextFragment,
}

impl TextBlockSplice {
    /// Constructs a source-guarded edit; context limits are checked on validation.
    ///
    /// # Errors
    /// Rejects non-direct-root paths and non-text-block guards.
    pub fn try_new(
        range: TextRange,
        expected: NodeRef,
        replacement: TextFragment,
    ) -> Result<Self, TextBlockSpliceError> {
        if range.container_path().len() != 1 || block_kind(&expected).is_err() {
            return Err(TextBlockSpliceError::InvalidTarget);
        }
        Ok(Self { range, expected, replacement })
    }

    /// Captures a complete source block without modifying the supplied document.
    ///
    /// # Errors
    /// Rejects foreign proofs, unsupported schemas, invalid ranges or fragments.
    pub fn capture(
        context: &EditorContext,
        document: &Document,
        range: TextRange,
        replacement: TextFragment,
    ) -> Result<Self, TextBlockSpliceError> {
        require_document(context, document)?;
        let expected = document
            .node_at(range.container_path())
            .map_err(|_| TextBlockSpliceError::InvalidTarget)?
            .clone();
        let operation = Self::try_new(range, expected, replacement)?;
        operation.validate(context)?;
        Ok(operation)
    }

    /// Returns the replaced source range in block-local UTF-16 coordinates.
    #[must_use]
    pub const fn range(&self) -> &TextRange {
        &self.range
    }
    /// Returns the complete optimistic source guard.
    #[must_use]
    pub const fn expected(&self) -> &NodeRef {
        &self.expected
    }
    /// Returns the inserted canonical formatted fragment.
    #[must_use]
    pub const fn replacement(&self) -> &TextFragment {
        &self.replacement
    }

    pub(crate) fn validate(&self, context: &EditorContext) -> Result<(), TextBlockSpliceError> {
        require_schema(context)?;
        let index = self.index()?;
        if u64::from(index)
            >= u64::try_from(context.limits().max_children_per_element()).unwrap_or(u64::MAX)
        {
            return Err(TextBlockSpliceError::InvalidTarget);
        }
        validate_block(context, self.expected.clone())?;
        validate_fragment(context, FragmentRole::Replacement, &self.replacement)?;
        let element = self.expected.as_element().ok_or(TextBlockSpliceError::InvalidTarget)?;
        let length = container_length(element, self.range.container_path())?;
        validate_range_boundary(element, self.range.start(), length)?;
        validate_range_boundary(element, self.range.end(), length)?;
        validate_block(context, self.result_node(length)?)?;
        Ok(())
    }

    pub(crate) fn apply(
        &self,
        context: &EditorContext,
        document: &Document,
    ) -> Result<AppliedOperation, TextBlockSpliceError> {
        require_document(context, document)?;
        self.validate(context)?;
        let current = document
            .node_at(self.range.container_path())
            .map_err(|_| TextBlockSpliceError::InvalidTarget)?;
        if current != &self.expected {
            return Err(TextBlockSpliceError::ExpectedMismatch);
        }
        let element = self.expected.as_element().ok_or(TextBlockSpliceError::InvalidTarget)?;
        let length = container_length(element, self.range.container_path())?;
        let result_node = self.result_node(length)?;
        if result_node == self.expected {
            return Ok(AppliedOperation::Unchanged);
        }
        let removed = extract_fragment(element, self.range.start(), self.range.end())?;
        let end = self
            .range
            .start()
            .checked_add(self.replacement.utf16_len().get())
            .map_err(TextSpliceApplyError::from)?;
        let inverse_range =
            TextRange::try_new(self.range.container_path().clone(), self.range.start(), end)
                .map_err(TextSpliceApplyError::from)?;
        let inverse = Self::try_new(inverse_range.clone(), result_node.clone(), removed.clone())?;
        let old_count = u32::try_from(element.children().len())
            .map_err(|_| TextBlockSpliceError::InvalidTarget)?;
        let new_count = u32::try_from(
            result_node.as_element().ok_or(TextBlockSpliceError::InvalidTarget)?.children().len(),
        )
        .map_err(|_| TextBlockSpliceError::InvalidTarget)?;
        let root = document.root().as_element().ok_or(TextBlockSpliceError::InvalidTarget)?;
        let mut children = root.children().iter().cloned().collect::<Vec<_>>();
        let index =
            usize::try_from(self.index()?).map_err(|_| TextBlockSpliceError::InvalidTarget)?;
        *children.get_mut(index).ok_or(TextBlockSpliceError::InvalidTarget)? = result_node;
        let root =
            root.try_with_children(children).map_err(|_| TextBlockSpliceError::InvalidTarget)?;
        // No incremental proof shortcut: account for unchanged siblings too.
        let result = Document::try_new(context.schema(), NodeRef::element(root), context.limits())?;
        Ok(AppliedOperation::Changed(Box::new(AppliedChange {
            document: result,
            inverse: Operation::TextBlockSplice(inverse),
            relocation: TextSpliceMap::new(
                self.range.clone(),
                self.replacement.utf16_len(),
                fragments_have_identical_text(&removed, &self.replacement),
            )
            .into(),
            change: TextChange::new(
                self.range.container_path().clone(),
                self.range.clone(),
                inverse_range,
                ChildRange::new(0, old_count),
                ChildRange::new(0, new_count),
            )
            .into(),
        })))
    }

    fn index(&self) -> Result<u32, TextBlockSpliceError> {
        let path = self.range.container_path();
        if path.len() != 1 {
            return Err(TextBlockSpliceError::InvalidTarget);
        }
        path.last_index().ok_or(TextBlockSpliceError::InvalidTarget)
    }
    fn result_node(&self, length: TextOffset) -> Result<NodeRef, TextBlockSpliceError> {
        let element = self.expected.as_element().ok_or(TextBlockSpliceError::InvalidTarget)?;
        let children = build_result_children(
            element,
            self.range.start(),
            self.range.end(),
            length,
            &self.replacement,
        )?;
        Ok(NodeRef::element(
            element.try_with_children(children).map_err(|_| TextBlockSpliceError::InvalidTarget)?,
        ))
    }
}

fn require_schema(context: &EditorContext) -> Result<(), TextBlockSpliceError> {
    if context.schema().supports_text_block_kind_operations() {
        Ok(())
    } else {
        Err(TextBlockSpliceError::UnsupportedSchema)
    }
}
fn require_document(
    context: &EditorContext,
    document: &Document,
) -> Result<(), TextBlockSpliceError> {
    require_schema(context)?;
    if let Some(error) = document.proof_mismatch(context.schema(), context.limits()) {
        return Err(error.into());
    }
    Ok(())
}
fn validate_block(context: &EditorContext, block: NodeRef) -> Result<(), TextBlockSpliceError> {
    block_kind(&block).map_err(|_| TextBlockSpliceError::InvalidTarget)?;
    let root = ElementNode::try_new(
        context.schema().root_kind().clone(),
        None,
        PropertyMap::default(),
        vec![block],
    )
    .map_err(|_| TextBlockSpliceError::InvalidTarget)?;
    Document::try_new(context.schema(), NodeRef::element(root), context.limits())?;
    Ok(())
}

/// Why a guarded structural text edit could not be admitted or applied.
#[derive(Clone, Debug, Eq, Error, PartialEq)]
pub enum TextBlockSpliceError {
    /// The compiler did not grant the closed text-block capability.
    #[error("text-block splice requires the sealed text-block schema")]
    UnsupportedSchema,
    /// Target path, source kind or child count is invalid.
    #[error("invalid text-block splice target")]
    InvalidTarget,
    /// The complete live block differs from its optimistic source guard.
    #[error("text-block splice source guard does not match")]
    ExpectedMismatch,
    /// The document belongs to a different schema or resource policy.
    #[error(transparent)]
    DocumentProof(#[from] DocumentProofMismatch),
    /// The guarded fragment or complete result violates schema/resource limits.
    #[error(transparent)]
    Validation(#[from] ValidationReport),
    /// Shared text slicing, Unicode, fragment or coordinate validation failed.
    #[error(transparent)]
    Text(#[from] TextSpliceApplyError),
}

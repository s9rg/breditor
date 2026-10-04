//! Scalar-aligned text editing in the sealed flat-list document language.
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
    position::{NodePath, TextOffset},
    schema::ValidationReport,
    state::EditorContext,
};
use thiserror::Error;

/// Replaces text in one bare block or one block inside a flat list item.
///
/// Coordinates are aggregate UTF-16 offsets in a paragraph/heading at `[root]`
/// or `[root, item, 0]`. The complete containing root child is the source guard:
/// list kind/start and sibling items are intentionally guarded as well as text.
/// All list structure and heading ranks are preserved. Typed inline values use
/// the existing canonical fragment contracts. Static fragment admission includes
/// item/list wrappers, and publication validates the complete result document.
///
/// This is a separate experimental runtime operation, not a widening of the
/// direct-root heading or paragraph operations. It has no durable encoding yet.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct FlatListTextSplice {
    range: TextRange,
    expected_root: NodeRef,
    replacement: TextFragment,
}
impl FlatListTextSplice {
    /// Constructs an edit with a complete containing-root guard.
    ///
    /// # Errors
    /// Rejects paths outside the flat shape and guards not resolving to a text
    /// block. Schema/resource and scalar-boundary validation is context-dependent.
    pub fn try_new(
        range: TextRange,
        expected_root: NodeRef,
        replacement: TextFragment,
    ) -> Result<Self, FlatListTextSpliceError> {
        let operation = Self { range, expected_root, replacement };
        operation.root_index()?;
        block_kind(operation.block()?).map_err(|_| FlatListTextSpliceError::InvalidTarget)?;
        Ok(operation)
    }
    /// Captures the current containing root without changing the document.
    ///
    /// # Errors
    /// Rejects unsupported schemas, foreign proofs, absent paths, invalid text
    /// ranges or replacement fragments.
    pub fn capture(
        context: &EditorContext,
        document: &Document,
        range: TextRange,
        replacement: TextFragment,
    ) -> Result<Self, FlatListTextSpliceError> {
        require_document(context, document)?;
        let index =
            range.container_path().iter().next().ok_or(FlatListTextSpliceError::InvalidTarget)?;
        let path = NodePath::try_from_indices(vec![index])
            .map_err(|_| FlatListTextSpliceError::InvalidTarget)?;
        let expected_root =
            document.node_at(&path).map_err(|_| FlatListTextSpliceError::InvalidTarget)?.clone();
        let operation = Self::try_new(range, expected_root, replacement)?;
        operation.validate(context)?;
        Ok(operation)
    }
    /// Returns the block-local text range, including its full block path.
    #[must_use]
    pub const fn range(&self) -> &TextRange {
        &self.range
    }
    /// Returns the complete optimistic guard for the containing root child.
    #[must_use]
    pub const fn expected_root(&self) -> &NodeRef {
        &self.expected_root
    }
    /// Returns the canonical inserted text and typed formats.
    #[must_use]
    pub const fn replacement(&self) -> &TextFragment {
        &self.replacement
    }

    pub(crate) fn validate(&self, context: &EditorContext) -> Result<(), FlatListTextSpliceError> {
        require_schema(context)?;
        self.root_index()?;
        let maximum =
            u64::try_from(context.limits().max_children_per_element()).unwrap_or(u64::MAX);
        if self.range.container_path().iter().any(|index| u64::from(index) >= maximum) {
            return Err(FlatListTextSpliceError::InvalidTarget);
        }
        validate_root(context, self.expected_root.clone())?;
        validate_fragment(context, FragmentRole::Replacement, &self.replacement)?;
        let block = self.block()?.as_element().ok_or(FlatListTextSpliceError::InvalidTarget)?;
        let length = container_length(block, self.range.container_path())?;
        validate_range_boundary(block, self.range.start(), length)?;
        validate_range_boundary(block, self.range.end(), length)?;
        validate_root(context, self.result_root(length)?)?;
        Ok(())
    }
    pub(crate) fn apply(
        &self,
        context: &EditorContext,
        document: &Document,
    ) -> Result<AppliedOperation, FlatListTextSpliceError> {
        require_document(context, document)?;
        self.validate(context)?;
        let index = usize::try_from(self.root_index()?)
            .map_err(|_| FlatListTextSpliceError::InvalidTarget)?;
        let root = document.root().as_element().ok_or(FlatListTextSpliceError::InvalidTarget)?;
        if root.children().get(index) != Some(&self.expected_root) {
            return Err(FlatListTextSpliceError::ExpectedMismatch);
        }
        let block = self.block()?.as_element().ok_or(FlatListTextSpliceError::InvalidTarget)?;
        let length = container_length(block, self.range.container_path())?;
        let result_root = self.result_root(length)?;
        if result_root == self.expected_root {
            return Ok(AppliedOperation::Unchanged);
        }
        let removed = extract_fragment(block, self.range.start(), self.range.end())?;
        let inverse_end = self
            .range
            .start()
            .checked_add(self.replacement.utf16_len().get())
            .map_err(TextSpliceApplyError::from)?;
        let inverse_range = TextRange::try_new(
            self.range.container_path().clone(),
            self.range.start(),
            inverse_end,
        )
        .map_err(TextSpliceApplyError::from)?;
        let inverse = Self::try_new(inverse_range.clone(), result_root.clone(), removed.clone())?;
        let old_count = u32::try_from(block.children().len())
            .map_err(|_| FlatListTextSpliceError::InvalidTarget)?;
        let new_count = u32::try_from(
            inverse
                .block()?
                .as_element()
                .ok_or(FlatListTextSpliceError::InvalidTarget)?
                .children()
                .len(),
        )
        .map_err(|_| FlatListTextSpliceError::InvalidTarget)?;
        let mut children = root.children().iter().cloned().collect::<Vec<_>>();
        *children.get_mut(index).ok_or(FlatListTextSpliceError::InvalidTarget)? = result_root;
        let root =
            root.try_with_children(children).map_err(|_| FlatListTextSpliceError::InvalidTarget)?;
        let document =
            Document::try_new(context.schema(), NodeRef::element(root), context.limits())?;
        Ok(AppliedOperation::Changed(Box::new(AppliedChange {
            document,
            inverse: Operation::FlatListTextSplice(inverse),
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
    fn root_index(&self) -> Result<u32, FlatListTextSpliceError> {
        match self.range.container_path().as_slice() {
            [index] | [index, _, 0] => Ok(*index),
            _ => Err(FlatListTextSpliceError::InvalidTarget),
        }
    }
    fn block(&self) -> Result<&NodeRef, FlatListTextSpliceError> {
        self.root_index()?;
        let mut node = &self.expected_root;
        for index in self.range.container_path().iter().skip(1) {
            let index =
                usize::try_from(index).map_err(|_| FlatListTextSpliceError::InvalidTarget)?;
            node = node
                .as_element()
                .and_then(|node| node.children().get(index))
                .ok_or(FlatListTextSpliceError::InvalidTarget)?;
        }
        Ok(node)
    }
    fn result_root(&self, length: TextOffset) -> Result<NodeRef, FlatListTextSpliceError> {
        let block = self.block()?.as_element().ok_or(FlatListTextSpliceError::InvalidTarget)?;
        let children = build_result_children(
            block,
            self.range.start(),
            self.range.end(),
            length,
            &self.replacement,
        )?;
        let result = NodeRef::element(
            block
                .try_with_children(children)
                .map_err(|_| FlatListTextSpliceError::InvalidTarget)?,
        );
        replace_relative(&self.expected_root, &self.range.container_path().as_slice()[1..], result)
    }
}

// Called only with the constructor-checked flat path (zero or two indexes).
fn replace_relative(
    node: &NodeRef,
    path: &[u32],
    replacement: NodeRef,
) -> Result<NodeRef, FlatListTextSpliceError> {
    let Some((index, rest)) = path.split_first() else {
        return Ok(replacement);
    };
    let element = node.as_element().ok_or(FlatListTextSpliceError::InvalidTarget)?;
    let index = usize::try_from(*index).map_err(|_| FlatListTextSpliceError::InvalidTarget)?;
    let mut children = element.children().iter().cloned().collect::<Vec<_>>();
    let child = children.get_mut(index).ok_or(FlatListTextSpliceError::InvalidTarget)?;
    *child = replace_relative(child, rest, replacement)?;
    element
        .try_with_children(children)
        .map(NodeRef::element)
        .map_err(|_| FlatListTextSpliceError::InvalidTarget)
}
fn require_schema(context: &EditorContext) -> Result<(), FlatListTextSpliceError> {
    if context.schema().supports_flat_list_operations() {
        Ok(())
    } else {
        Err(FlatListTextSpliceError::UnsupportedSchema)
    }
}
fn require_document(
    context: &EditorContext,
    document: &Document,
) -> Result<(), FlatListTextSpliceError> {
    require_schema(context)?;
    if let Some(error) = document.proof_mismatch(context.schema(), context.limits()) {
        return Err(error.into());
    }
    Ok(())
}
fn validate_root(context: &EditorContext, root: NodeRef) -> Result<(), FlatListTextSpliceError> {
    let root = ElementNode::try_new(
        context.schema().root_kind().clone(),
        None,
        PropertyMap::default(),
        vec![root],
    )
    .map_err(|_| FlatListTextSpliceError::InvalidTarget)?;
    Document::try_new(context.schema(), NodeRef::element(root), context.limits())?;
    Ok(())
}

/// Failure to construct, admit or apply a flat-list text edit.
#[derive(Clone, Debug, Eq, Error, PartialEq)]
pub enum FlatListTextSpliceError {
    /// The exact flat-list compiler capability was not granted.
    #[error("flat-list text splice requires the sealed flat-list schema")]
    UnsupportedSchema,
    /// The root/item/block path or guarded shape is invalid.
    #[error("invalid flat-list text splice target")]
    InvalidTarget,
    /// The containing root child no longer matches its complete source guard.
    #[error("flat-list text splice source guard does not match")]
    ExpectedMismatch,
    /// Document belongs to a different schema or resource policy.
    #[error(transparent)]
    DocumentProof(#[from] DocumentProofMismatch),
    /// A fragment or complete result violates schema/resource limits.
    #[error(transparent)]
    Validation(#[from] ValidationReport),
    /// Shared text, scalar-boundary or coordinate validation failed.
    #[error(transparent)]
    Text(#[from] TextSpliceApplyError),
}

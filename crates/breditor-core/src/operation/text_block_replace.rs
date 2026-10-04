//! Atomic structural text replacement across direct-root paragraphs/headings.
use super::{
    AppliedChange, AppliedOperation, ChildRange, ChildrenChange, Operation, RelocationStepMap,
    RootTextRange, RootTextReplaceError, RootTextReplaceMap, block_kind,
    root_text_replace::{DerivedReplacement, derive_replacement},
    text_splice::fragments_have_identical_text,
};
use crate::{
    document::{
        Document, DocumentProofMismatch, ElementNode, NodeRef, PropertyMap, TextFragment, TextRun,
    },
    position::NodePath,
    schema::ValidationReport,
    state::EditorContext,
};
use std::sync::Arc;
use thiserror::Error;

/// Replaces one text range with a nonempty sequence of typed text-block fragments.
///
/// Complete intersected source blocks are guards. Each replacement node supplies
/// its explicit paragraph/heading kind and inserted formatted text; the surviving
/// source prefix joins the first node and the suffix joins the last. Thus split,
/// join and cross-block replacement need no invalid intermediate publication.
/// The inverse restores every source kind, not just the retained left kind.
/// When block count and each block's logical text are unchanged, relocation
/// preserves aggregate offsets and affinities through any text-run reshaping.
/// Experimental only; no existing durable codec admits this operation.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TextBlockReplace {
    range: RootTextRange,
    expected: Arc<[NodeRef]>,
    replacement: Arc<[NodeRef]>,
}

impl TextBlockReplace {
    /// Constructs a complete source-guarded structural edit.
    ///
    /// # Errors
    /// Rejects non-text blocks, inconsistent counts, invalid scalar boundaries,
    /// coordinate overflow and unrepresentable canonical text seams.
    pub fn try_new(
        range: RootTextRange,
        expected: Vec<NodeRef>,
        replacement: Vec<NodeRef>,
    ) -> Result<Self, TextBlockReplaceError> {
        let source = fragments(&expected)?;
        let inserted = fragments(&replacement)?;
        let derived = derive_replacement(&range, &source, &inserted)?;
        derive_replacement(&derived.inverse_range, &derived.result, &derived.removed)?;
        Ok(Self { range, expected: Arc::from(expected), replacement: Arc::from(replacement) })
    }

    /// Captures complete source blocks after checking the actual root span.
    ///
    /// # Errors
    /// Rejects foreign proofs, unsupported schemas, absent source spans or invalid
    /// static recipes. Application additionally validates all retained siblings.
    pub fn capture(
        context: &EditorContext,
        document: &Document,
        range: RootTextRange,
        replacement: Vec<NodeRef>,
    ) -> Result<Self, TextBlockReplaceError> {
        require_document(context, document)?;
        let root = document.root().as_element().ok_or(TextBlockReplaceError::InvalidTarget)?;
        let start = usize::try_from(range.start().paragraph_index())
            .map_err(|_| TextBlockReplaceError::InvalidTarget)?;
        let end = usize::try_from(range.end().paragraph_index())
            .map_err(|_| TextBlockReplaceError::InvalidTarget)?;
        // Bound protocol-derived indexes before allocating source guards.
        if end >= root.children().len() || start > end {
            return Err(TextBlockReplaceError::InvalidTarget);
        }
        let expected = root.children().iter().skip(start).take(end - start + 1).cloned().collect();
        let operation = Self::try_new(range, expected, replacement)?;
        operation.validate(context)?;
        Ok(operation)
    }

    /// Returns the scalar-aligned source range in root text coordinates.
    #[must_use]
    pub const fn range(&self) -> &RootTextRange {
        &self.range
    }
    /// Returns complete intersected source block guards.
    #[must_use]
    pub fn expected(&self) -> &[NodeRef] {
        &self.expected
    }
    /// Returns inserted text-block fragments with explicit result kinds.
    #[must_use]
    pub fn replacement(&self) -> &[NodeRef] {
        &self.replacement
    }

    pub(crate) fn validate(&self, context: &EditorContext) -> Result<(), TextBlockReplaceError> {
        require_schema(context)?;
        let maximum =
            u64::try_from(context.limits().max_children_per_element()).unwrap_or(u64::MAX);
        let new_end = u64::from(self.range.start().paragraph_index())
            .checked_add(
                u64::try_from(self.replacement.len())
                    .map_err(|_| TextBlockReplaceError::InvalidTarget)?,
            )
            .ok_or(TextBlockReplaceError::InvalidTarget)?;
        if u64::from(self.range.end().paragraph_index()) >= maximum || new_end > maximum {
            return Err(TextBlockReplaceError::RootChildLimit);
        }
        validate_blocks(context, self.expected.to_vec())?;
        validate_blocks(context, self.replacement.to_vec())?;
        let derived = self.derive()?;
        validate_blocks(context, rebuild(&self.replacement, &derived.result)?)?;
        Ok(())
    }

    pub(crate) fn apply(
        &self,
        context: &EditorContext,
        document: &Document,
    ) -> Result<AppliedOperation, TextBlockReplaceError> {
        require_document(context, document)?;
        self.validate(context)?;
        let root = document.root().as_element().ok_or(TextBlockReplaceError::InvalidTarget)?;
        let start = self.range.start().paragraph_index();
        let old_end = self
            .range
            .end()
            .paragraph_index()
            .checked_add(1)
            .ok_or(TextBlockReplaceError::InvalidTarget)?;
        let start_native =
            usize::try_from(start).map_err(|_| TextBlockReplaceError::InvalidTarget)?;
        let end_native =
            usize::try_from(old_end).map_err(|_| TextBlockReplaceError::InvalidTarget)?;
        if end_native > root.children().len()
            || !root
                .children()
                .iter()
                .skip(start_native)
                .take(self.expected.len())
                .eq(self.expected.iter())
        {
            return Err(TextBlockReplaceError::ExpectedMismatch);
        }
        let derived = self.derive()?;
        let result = rebuild(&self.replacement, &derived.result)?;
        if result.as_slice() == self.expected.as_ref() {
            return Ok(AppliedOperation::Unchanged);
        }
        let source = fragments(&self.expected)?;
        let preserves_text = source.len() == derived.result.len()
            && source
                .iter()
                .zip(&derived.result)
                .all(|(old, new)| fragments_have_identical_text(old, new));
        let inverse = Self::try_new(
            derived.inverse_range,
            result.clone(),
            rebuild(&self.expected, &derived.removed)?,
        )?;
        let count =
            u32::try_from(result.len()).map_err(|_| TextBlockReplaceError::InvalidTarget)?;
        let new_end = start.checked_add(count).ok_or(TextBlockReplaceError::InvalidTarget)?;
        let children = root
            .children()
            .iter()
            .take(start_native)
            .cloned()
            .chain(result)
            .chain(root.children().iter().skip(end_native).cloned())
            .collect();
        let root =
            root.try_with_children(children).map_err(|_| TextBlockReplaceError::InvalidTarget)?;
        let document =
            Document::try_new(context.schema(), NodeRef::element(root), context.limits())?;
        let inserted = fragments(&self.replacement)?;
        let first = inserted.first().ok_or(TextBlockReplaceError::InvalidTarget)?.utf16_len();
        let last = inserted.last().ok_or(TextBlockReplaceError::InvalidTarget)?.utf16_len();
        Ok(AppliedOperation::Changed(Box::new(AppliedChange {
            document,
            inverse: Operation::TextBlockReplace(inverse),
            relocation: if preserves_text {
                RelocationStepMap::TextBlockTextIdentity { start, end: old_end }
            } else {
                RootTextReplaceMap::new(self.range.clone(), count, first, last).into()
            },
            change: ChildrenChange::new(
                NodePath::root(),
                ChildRange::new(start, old_end),
                ChildRange::new(start, new_end),
            )
            .into(),
        })))
    }

    fn derive(&self) -> Result<DerivedReplacement, TextBlockReplaceError> {
        Ok(derive_replacement(
            &self.range,
            &fragments(&self.expected)?,
            &fragments(&self.replacement)?,
        )?)
    }
}

fn fragments(nodes: &[NodeRef]) -> Result<Vec<TextFragment>, TextBlockReplaceError> {
    nodes
        .iter()
        .map(|node| {
            block_kind(node).map_err(|_| TextBlockReplaceError::InvalidTarget)?;
            let element = node.as_element().ok_or(TextBlockReplaceError::InvalidTarget)?;
            let runs = element
                .children()
                .iter()
                .map(|node| {
                    node.as_text()
                        .map(TextRun::from_text_node)
                        .ok_or(TextBlockReplaceError::InvalidTarget)
                })
                .collect::<Result<Vec<_>, _>>()?;
            TextFragment::try_from_runs(runs).map_err(|_| TextBlockReplaceError::InvalidTarget)
        })
        .collect()
}
fn rebuild(
    templates: &[NodeRef],
    text: &[TextFragment],
) -> Result<Vec<NodeRef>, TextBlockReplaceError> {
    if templates.len() != text.len() {
        return Err(TextBlockReplaceError::InvalidTarget);
    }
    templates
        .iter()
        .zip(text)
        .map(|(node, fragment)| {
            let element = node.as_element().ok_or(TextBlockReplaceError::InvalidTarget)?;
            let children =
                fragment.iter().cloned().map(|run| NodeRef::text(run.into_text_node())).collect();
            Ok(NodeRef::element(
                element
                    .try_with_children(children)
                    .map_err(|_| TextBlockReplaceError::InvalidTarget)?,
            ))
        })
        .collect()
}
fn require_schema(context: &EditorContext) -> Result<(), TextBlockReplaceError> {
    if context.schema().supports_text_block_kind_operations() {
        Ok(())
    } else {
        Err(TextBlockReplaceError::UnsupportedSchema)
    }
}
fn require_document(
    context: &EditorContext,
    document: &Document,
) -> Result<(), TextBlockReplaceError> {
    require_schema(context)?;
    if let Some(error) = document.proof_mismatch(context.schema(), context.limits()) {
        return Err(error.into());
    }
    Ok(())
}
fn validate_blocks(
    context: &EditorContext,
    nodes: Vec<NodeRef>,
) -> Result<(), TextBlockReplaceError> {
    let root = ElementNode::try_new(
        context.schema().root_kind().clone(),
        None,
        PropertyMap::default(),
        nodes,
    )
    .map_err(|_| TextBlockReplaceError::InvalidTarget)?;
    Document::try_new(context.schema(), NodeRef::element(root), context.limits())?;
    Ok(())
}

/// Failure to construct, admit or apply a structural text-block replacement.
#[derive(Clone, Debug, Eq, Error, PartialEq)]
pub enum TextBlockReplaceError {
    /// The source or result span exceeds the context's root child budget.
    #[error("text-block replacement exceeds root child limit")]
    RootChildLimit,
    /// The compiler did not grant the sealed text-block capability.
    #[error("text-block replacement requires the sealed text-block schema")]
    UnsupportedSchema,
    /// Source/replacement shape, span or coordinate is invalid.
    #[error("invalid text-block replacement target")]
    InvalidTarget,
    /// A live source block differs from its complete optimistic guard.
    #[error("text-block replacement source guard does not match")]
    ExpectedMismatch,
    /// The document belongs to a different context proof.
    #[error(transparent)]
    DocumentProof(#[from] DocumentProofMismatch),
    /// A source fragment or complete result violates schema/resource limits.
    #[error(transparent)]
    Validation(#[from] ValidationReport),
    /// Shared text slicing, scalar boundaries or inverse derivation failed.
    #[error(transparent)]
    Text(#[from] RootTextReplaceError),
}

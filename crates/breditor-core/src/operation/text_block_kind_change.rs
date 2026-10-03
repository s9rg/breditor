//! Exact guarded replacement of semantic kinds on direct-root text blocks.

use std::{ops::Range, sync::Arc};
use thiserror::Error;

use super::{
    AppliedChange, AppliedOperation, ChildRange, ChildrenChange, Operation, RelocationStepMap,
};
use crate::{
    block::{HeadingLevel, TextBlockKind},
    document::{
        Document, DocumentProofMismatch, ElementNode, NodeRef, PropertyInteger, PropertyMap,
        PropertyValue,
    },
    identity::QualifiedName,
    position::NodePath,
    schema::ValidationReport,
    state::EditorContext,
};

/// Changes a nonempty contiguous span of direct-root paragraphs/headings.
///
/// The complete source nodes are optimistic guards. Only element kind and the
/// closed heading-rank property change: child nodes, text, inline formats and
/// their paths remain exact. The inverse retains every source kind separately.
/// This experimental operation has no V1–V3 durable encoding.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TextBlockKindChange {
    start: u32,
    expected: Arc<[NodeRef]>,
    replacement: Arc<[TextBlockKind]>,
}

impl TextBlockKindChange {
    /// Constructs a same-count kind replacement with complete source guards.
    ///
    /// # Errors
    ///
    /// Returns [`TextBlockKindChangeError::InvalidSpan`] for empty, unequal or
    /// overflowing spans. Schema, source-node and resource validation occur
    /// through [`Operation::validate`] and again at application.
    pub fn try_new(
        start: u32,
        expected: Vec<NodeRef>,
        replacement: Vec<TextBlockKind>,
    ) -> Result<Self, TextBlockKindChangeError> {
        let count =
            u32::try_from(expected.len()).map_err(|_| TextBlockKindChangeError::InvalidSpan)?;
        if count == 0 || expected.len() != replacement.len() || start.checked_add(count).is_none() {
            return Err(TextBlockKindChangeError::InvalidSpan);
        }
        Ok(Self { start, expected: expected.into(), replacement: replacement.into() })
    }

    /// Captures a half-open root-child span for one uniform target kind.
    ///
    /// # Errors
    ///
    /// Rejects unsupported schemas, foreign document proofs, invalid spans or
    /// source/result resource violations. No document state is changed.
    pub fn capture(
        context: &EditorContext,
        document: &Document,
        span: Range<u32>,
        target: TextBlockKind,
    ) -> Result<Self, TextBlockKindChangeError> {
        require_document(context, document)?;
        let root = document.root().as_element().ok_or(TextBlockKindChangeError::InvalidTarget)?;
        let start =
            usize::try_from(span.start).map_err(|_| TextBlockKindChangeError::InvalidSpan)?;
        let end = usize::try_from(span.end).map_err(|_| TextBlockKindChangeError::InvalidSpan)?;
        if start >= end || end > root.children().len() {
            return Err(TextBlockKindChangeError::InvalidSpan);
        }
        let expected = root.children().iter().skip(start).take(end - start).cloned().collect();
        let operation = Self::try_new(span.start, expected, vec![target; end - start])?;
        operation.validate(context)?;
        Ok(operation)
    }

    /// Returns the inclusive root-child index.
    #[must_use]
    pub const fn start(&self) -> u32 {
        self.start
    }

    /// Returns the complete, immutable source-node guards.
    #[must_use]
    pub fn expected(&self) -> &[NodeRef] {
        &self.expected
    }

    /// Returns one checked target kind per source block, in document order.
    #[must_use]
    pub fn replacement(&self) -> &[TextBlockKind] {
        &self.replacement
    }

    pub(crate) fn validate(&self, context: &EditorContext) -> Result<(), TextBlockKindChangeError> {
        require_schema(context)?;
        let end = self.end()?;
        if usize::try_from(end).map_err(|_| TextBlockKindChangeError::InvalidSpan)?
            > context.limits().max_children_per_element()
        {
            return Err(TextBlockKindChangeError::InvalidSpan);
        }
        validate_blocks(context, self.expected.to_vec())?;
        validate_blocks(context, self.result_nodes()?)?;
        Ok(())
    }

    pub(crate) fn apply(
        &self,
        context: &EditorContext,
        document: &Document,
    ) -> Result<AppliedOperation, TextBlockKindChangeError> {
        require_document(context, document)?;
        self.validate(context)?;
        let root = document.root().as_element().ok_or(TextBlockKindChangeError::InvalidTarget)?;
        let start =
            usize::try_from(self.start).map_err(|_| TextBlockKindChangeError::InvalidSpan)?;
        let end =
            usize::try_from(self.end()?).map_err(|_| TextBlockKindChangeError::InvalidSpan)?;
        if end > root.children().len()
            || !root.children().iter().skip(start).take(end - start).eq(self.expected.iter())
        {
            return Err(TextBlockKindChangeError::ExpectedMismatch);
        }
        let results = self.result_nodes()?;
        if results.as_slice() == self.expected.as_ref() {
            return Ok(AppliedOperation::Unchanged);
        }
        let source_kinds = self.expected.iter().map(block_kind).collect::<Result<Vec<_>, _>>()?;
        let inverse = Self::try_new(self.start, results.clone(), source_kinds)?;
        let mut children = root.children().iter().cloned().collect::<Vec<_>>();
        children.splice(start..end, results);
        let new_root = root
            .try_with_children(children)
            .map_err(|_| TextBlockKindChangeError::InvalidTarget)?;
        // Full validation is intentional: the first structural operation has
        // no incremental proof shortcut and accounts for all retained nodes.
        let result =
            Document::try_new(context.schema(), NodeRef::element(new_root), context.limits())?;
        let range = ChildRange::new(self.start, self.end()?);
        Ok(AppliedOperation::Changed(Box::new(AppliedChange {
            document: result,
            inverse: Operation::TextBlockKindChange(inverse),
            relocation: RelocationStepMap::TextBlockKindIdentity,
            change: ChildrenChange::new(NodePath::root(), range, range).into(),
        })))
    }

    fn end(&self) -> Result<u32, TextBlockKindChangeError> {
        self.start
            .checked_add(
                u32::try_from(self.expected.len())
                    .map_err(|_| TextBlockKindChangeError::InvalidSpan)?,
            )
            .ok_or(TextBlockKindChangeError::InvalidSpan)
    }

    fn result_nodes(&self) -> Result<Vec<NodeRef>, TextBlockKindChangeError> {
        self.expected
            .iter()
            .zip(self.replacement.iter())
            .map(|(source, kind)| {
                block_kind(source)?;
                let source = source.as_element().ok_or(TextBlockKindChangeError::InvalidTarget)?;
                let (name, properties) = match kind {
                    TextBlockKind::Paragraph => ("breditor/paragraph", PropertyMap::default()),
                    TextBlockKind::Heading(level) => {
                        let value = PropertyInteger::try_new(i64::from(level.get()))
                            .map_err(|_| TextBlockKindChangeError::InvalidTarget)?;
                        let props = PropertyMap::try_from_sorted(vec![(
                            QualifiedName::from_known_static("breditor/level"),
                            PropertyValue::from_integer(value),
                        )])
                        .map_err(|_| TextBlockKindChangeError::InvalidTarget)?;
                        ("breditor/heading", props)
                    }
                };
                let element = ElementNode::try_new(
                    QualifiedName::from_known_static(name),
                    None,
                    properties,
                    source.children().iter().cloned().collect(),
                )
                .map_err(|_| TextBlockKindChangeError::InvalidTarget)?;
                Ok(NodeRef::element(element))
            })
            .collect()
    }
}

pub(crate) fn block_kind(node: &NodeRef) -> Result<TextBlockKind, TextBlockKindChangeError> {
    let element = node.as_element().ok_or(TextBlockKindChangeError::InvalidTarget)?;
    if element.entity_id().is_some()
        || element.children().iter().any(|child| child.as_text().is_none())
    {
        return Err(TextBlockKindChangeError::InvalidTarget);
    }
    match element.kind().as_str() {
        "breditor/paragraph" if element.properties().is_empty() => Ok(TextBlockKind::Paragraph),
        "breditor/heading" if element.properties().len() == 1 => {
            let rank = element
                .properties()
                .get(&QualifiedName::from_known_static("breditor/level"))
                .and_then(PropertyValue::as_integer)
                .and_then(|rank| u32::try_from(rank.get()).ok())
                .and_then(|rank| HeadingLevel::try_new(rank).ok())
                .ok_or(TextBlockKindChangeError::InvalidTarget)?;
            Ok(TextBlockKind::Heading(rank))
        }
        _ => Err(TextBlockKindChangeError::InvalidTarget),
    }
}

fn require_schema(context: &EditorContext) -> Result<(), TextBlockKindChangeError> {
    if !context.schema().supports_text_block_kind_operations() {
        return Err(TextBlockKindChangeError::UnsupportedSchema);
    }
    Ok(())
}

fn require_document(
    context: &EditorContext,
    document: &Document,
) -> Result<(), TextBlockKindChangeError> {
    require_schema(context)?;
    if let Some(error) = document.proof_mismatch(context.schema(), context.limits()) {
        return Err(error.into());
    }
    Ok(())
}

fn validate_blocks(
    context: &EditorContext,
    blocks: Vec<NodeRef>,
) -> Result<(), TextBlockKindChangeError> {
    let root = ElementNode::try_new(
        context.schema().root_kind().clone(),
        None,
        PropertyMap::default(),
        blocks,
    )
    .map_err(|_| TextBlockKindChangeError::InvalidTarget)?;
    Document::try_new(context.schema(), NodeRef::element(root), context.limits())?;
    Ok(())
}

/// Why an experimental block-kind change cannot be admitted atomically.
#[derive(Clone, Debug, Eq, Error, PartialEq)]
pub enum TextBlockKindChangeError {
    /// The compiler has not granted the exact paragraph/heading capability.
    #[error("block-kind change requires the sealed text-block schema")]
    UnsupportedSchema,
    /// A span is empty, unequal, out of bounds, over budget or overflowing.
    #[error("invalid block-kind span")]
    InvalidSpan,
    /// A guard is not a canonical paragraph or heading text block.
    #[error("invalid block-kind target")]
    InvalidTarget,
    /// Current source nodes differ from the complete optimistic guards.
    #[error("block-kind source guard does not match")]
    ExpectedMismatch,
    /// Source document proof belongs to another schema or validation policy.
    #[error(transparent)]
    DocumentProof(#[from] DocumentProofMismatch),
    /// The complete candidate or guarded fragment violates schema/limits.
    #[error(transparent)]
    Validation(#[from] ValidationReport),
}

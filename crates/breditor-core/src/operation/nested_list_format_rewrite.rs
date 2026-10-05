//! Atomic nested inline-format changes with final-result-only validation.

use std::sync::Arc;
use thiserror::Error;

use super::{PointRelocation, RelocationError};
use crate::{
    document::{Document, DocumentProofMismatch, ElementNode, NodeRef, PropertyMap},
    position::NodePath,
    schema::ValidationReport,
    state::EditorContext,
};

/// Rewrites inline formats across a nonempty root span in one atomic operation.
///
/// Preserves all containers, block kinds, entity IDs, properties and logical text.
/// Transactions and operation V7 support this operation; earlier codecs do not.
/// Complete source guards and final document limits are checked.
/// Each returned edit contains its exact inverse and snapshot-local point mapping.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct NestedListFormatRewrite {
    start: u32,
    expected: Arc<[NodeRef]>,
    replacement: Arc<[NodeRef]>,
}

impl NestedListFormatRewrite {
    pub(crate) fn apply_operation(
        &self,
        context: &EditorContext,
        document: &Document,
    ) -> Result<super::AppliedOperation, NestedListFormatRewriteError> {
        let Some(edit) = self.apply(context, document)? else {
            return Ok(super::AppliedOperation::Unchanged);
        };
        Ok(super::AppliedOperation::Changed(Box::new(super::AppliedChange {
            document: edit.document,
            inverse: super::Operation::NestedListFormatRewrite(edit.inverse),
            relocation: edit.relocation,
            change: super::ChildrenChange::new(
                NodePath::root(),
                super::ChildRange::new(self.start, end(self.start, self.expected.len())?),
                super::ChildRange::new(self.start, end(self.start, self.replacement.len())?),
            )
            .into(),
        })))
    }
    /// Creates a source-guarded format-only edit.
    ///
    /// # Errors
    /// Rejects empty spans, invalid nested-list shapes, coordinate overflow, or
    /// any change to structure, element metadata or logical text. Context validation is separate.
    pub fn try_new(
        start: u32,
        expected: Vec<NodeRef>,
        replacement: Vec<NodeRef>,
    ) -> Result<Self, NestedListFormatRewriteError> {
        end(start, expected.len())?;
        end(start, replacement.len())?;
        blocks(&expected)?;
        blocks(&replacement)?;
        verify_formats_only(&expected, &replacement)?;
        Ok(Self { start, expected: expected.into(), replacement: replacement.into() })
    }

    /// Captures an exact, nonempty root-child guard from a matching document.
    ///
    /// # Errors
    /// Rejects unsupported schemas, foreign proofs, invalid spans or fragments.
    pub fn capture(
        context: &EditorContext,
        document: &Document,
        start: u32,
        count: u32,
        replacement: Vec<NodeRef>,
    ) -> Result<Self, NestedListFormatRewriteError> {
        require_document(context, document)?;
        let count =
            usize::try_from(count).map_err(|_| NestedListFormatRewriteError::InvalidTarget)?;
        let stop = usize::try_from(end(start, count)?)
            .map_err(|_| NestedListFormatRewriteError::InvalidTarget)?;
        let root =
            document.root().as_element().ok_or(NestedListFormatRewriteError::InvalidTarget)?;
        if stop > root.children().len() {
            return Err(NestedListFormatRewriteError::InvalidTarget);
        }
        let start_native =
            usize::try_from(start).map_err(|_| NestedListFormatRewriteError::InvalidTarget)?;
        let expected = root.children().iter().skip(start_native).take(count).cloned().collect();
        let operation = Self::try_new(start, expected, replacement)?;
        operation.validate(context)?;
        Ok(operation)
    }

    /// First guarded root-child index.
    #[must_use]
    pub const fn start(&self) -> u32 {
        self.start
    }
    /// Complete source roots, including list numbering and all inline content.
    #[must_use]
    pub fn expected(&self) -> &[NodeRef] {
        &self.expected
    }
    /// Complete replacement roots with identical structure and logical text.
    #[must_use]
    pub fn replacement(&self) -> &[NodeRef] {
        &self.replacement
    }

    pub(crate) fn validate(
        &self,
        context: &EditorContext,
    ) -> Result<(), NestedListFormatRewriteError> {
        require_schema(context)?;
        for nodes in [&self.expected, &self.replacement] {
            let stop = usize::try_from(end(self.start, nodes.len())?)
                .map_err(|_| NestedListFormatRewriteError::InvalidTarget)?;
            if stop > context.limits().max_children_per_element() {
                return Err(NestedListFormatRewriteError::RootChildLimit);
            }
            let root = ElementNode::try_new(
                context.schema().root_kind().clone(),
                None,
                PropertyMap::default(),
                nodes.to_vec(),
            )
            .map_err(|_| NestedListFormatRewriteError::InvalidTarget)?;
            Document::try_new(context.schema(), NodeRef::element(root), context.limits())?;
        }
        Ok(())
    }

    /// Applies the source-guarded edit atomically; returns `None` for a no-op.
    ///
    /// # Errors
    /// Rejects foreign proofs, stale guards, unsupported schemas or limits.
    pub fn apply(
        &self,
        context: &EditorContext,
        document: &Document,
    ) -> Result<Option<NestedListFormatRewriteEdit>, NestedListFormatRewriteError> {
        require_document(context, document)?;
        self.validate(context)?;
        let document_before = document.clone();
        let old_end = end(self.start, self.expected.len())?;
        let start =
            usize::try_from(self.start).map_err(|_| NestedListFormatRewriteError::InvalidTarget)?;
        let stop =
            usize::try_from(old_end).map_err(|_| NestedListFormatRewriteError::InvalidTarget)?;
        let root =
            document.root().as_element().ok_or(NestedListFormatRewriteError::InvalidTarget)?;
        if stop > root.children().len()
            || !root
                .children()
                .iter()
                .skip(start)
                .take(self.expected.len())
                .eq(self.expected.iter())
        {
            return Err(NestedListFormatRewriteError::ExpectedMismatch);
        }
        if self.expected == self.replacement {
            return Ok(None);
        }
        let children = root
            .children()
            .iter()
            .take(start)
            .cloned()
            .chain(self.replacement.iter().cloned())
            .chain(root.children().iter().skip(stop).cloned())
            .collect();
        let root = root
            .try_with_children(children)
            .map_err(|_| NestedListFormatRewriteError::InvalidTarget)?;
        let document =
            Document::try_new(context.schema(), NodeRef::element(root), context.limits())?;
        let inverse = Self {
            start: self.start,
            expected: self.replacement.clone(),
            replacement: self.expected.clone(),
        };
        Ok(Some(NestedListFormatRewriteEdit {
            before: document_before,
            document,
            inverse,
            relocation: super::RelocationStepMap::NestedListTextIdentity {
                start: self.start,
                end: old_end,
            },
        }))
    }
}

fn end(start: u32, count: usize) -> Result<u32, NestedListFormatRewriteError> {
    if count == 0 {
        return Err(NestedListFormatRewriteError::InvalidTarget);
    }
    start
        .checked_add(u32::try_from(count).map_err(|_| NestedListFormatRewriteError::InvalidTarget)?)
        .ok_or(NestedListFormatRewriteError::InvalidTarget)
}

/// Reuse the bounded nested-shape traversal without widening reframe semantics.
fn blocks(roots: &[NodeRef]) -> Result<(), NestedListFormatRewriteError> {
    super::nested_list_reframe::blocks(roots)
        .map(|_| ())
        .map_err(|_| NestedListFormatRewriteError::InvalidTarget)
}

fn require_schema(context: &EditorContext) -> Result<(), NestedListFormatRewriteError> {
    if context.schema().supports_nested_list_reframe() {
        Ok(())
    } else {
        Err(NestedListFormatRewriteError::UnsupportedSchema)
    }
}
fn require_document(
    context: &EditorContext,
    document: &Document,
) -> Result<(), NestedListFormatRewriteError> {
    require_schema(context)?;
    if let Some(error) = document.proof_mismatch(context.schema(), context.limits()) {
        return Err(error.into());
    }
    Ok(())
}

/// Failure to construct, admit or apply a nested-list format edit.
#[derive(Clone, Debug, Eq, Error, PartialEq)]
pub enum NestedListFormatRewriteError {
    /// Unsupported shape, empty span or unrepresentable coordinate.
    #[error("invalid nested-list format rewrite target")]
    InvalidTarget,
    /// Structure, element metadata or logical text changed.
    #[error("nested-list format rewrite must preserve structure and logical text")]
    ContentChanged,
    /// The compiler did not grant the sealed nested-list capability.
    #[error("nested-list format rewrite requires the sealed nested-list schema")]
    UnsupportedSchema,
    /// A complete optimistic source guard no longer matches.
    #[error("nested-list format rewrite source guard does not match")]
    ExpectedMismatch,
    /// A root span exceeds the context's child budget.
    #[error("nested-list format rewrite exceeds root child limit")]
    RootChildLimit,
    /// The document proof belongs to another schema or limits.
    #[error(transparent)]
    DocumentProof(#[from] DocumentProofMismatch),
    /// Source, replacement or complete result violates schema/resource limits.
    #[error(transparent)]
    Validation(#[from] ValidationReport),
}

/// Verified immutable result of a nested format rewrite; not a session commit.
#[derive(Clone, Debug)]
pub struct NestedListFormatRewriteEdit {
    before: Document,
    document: Document,
    inverse: NestedListFormatRewrite,
    relocation: super::RelocationStepMap,
}
impl NestedListFormatRewriteEdit {
    /// Resulting document, validated against the original context's limits.
    #[must_use]
    pub const fn document(&self) -> &Document {
        &self.document
    }
    /// Exact guarded inverse, including original container starts and hierarchy.
    #[must_use]
    pub const fn inverse(&self) -> &NestedListFormatRewrite {
        &self.inverse
    }
    /// Preserves aggregate text offsets and affinity through run reshaping.
    /// # Errors
    /// Rejects invalid source or resulting points.
    pub fn relocate(
        &self,
        point: &crate::position::Point,
    ) -> Result<PointRelocation, RelocationError> {
        self.relocation.relocate(&self.before, &self.document, point)
    }
}

fn verify_formats_only(
    expected: &[NodeRef],
    replacement: &[NodeRef],
) -> Result<(), NestedListFormatRewriteError> {
    if expected.len() != replacement.len() {
        return Err(NestedListFormatRewriteError::ContentChanged);
    }
    let mut pending: Vec<_> = expected.iter().zip(replacement).collect();
    while let Some((left, right)) = pending.pop() {
        let left = left.as_element().ok_or(NestedListFormatRewriteError::InvalidTarget)?;
        let right = right.as_element().ok_or(NestedListFormatRewriteError::InvalidTarget)?;
        if left.kind() != right.kind()
            || left.entity_id() != right.entity_id()
            || left.properties() != right.properties()
        {
            return Err(NestedListFormatRewriteError::ContentChanged);
        }
        if matches!(left.kind().as_str(), "breditor/paragraph" | "breditor/heading") {
            let text = |node: &ElementNode| -> Result<crate::document::TextFragment, NestedListFormatRewriteError> {
                let runs = node.children().iter().map(|node| node.as_text().map(crate::document::TextRun::from_text_node)
                    .ok_or(NestedListFormatRewriteError::InvalidTarget)).collect::<Result<Vec<_>, _>>()?;
                crate::document::TextFragment::try_from_runs(runs).map_err(|_| NestedListFormatRewriteError::InvalidTarget)
            };
            if !super::text_splice::fragments_have_identical_text(&text(left)?, &text(right)?) {
                return Err(NestedListFormatRewriteError::ContentChanged);
            }
        } else {
            if left.children().len() != right.children().len() {
                return Err(NestedListFormatRewriteError::ContentChanged);
            }
            pending.extend(left.children().iter().zip(right.children().iter()));
        }
    }
    Ok(())
}

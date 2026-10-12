//! Guarded list-container changes that preserve the complete text-block sequence.

use std::sync::Arc;
use thiserror::Error;

use super::{PointRelocation, RelocationError};
use crate::{
    document::{Document, DocumentProofMismatch, ElementNode, NodeRef, PropertyMap},
    position::NodePath,
    schema::ValidationReport,
    state::EditorContext,
};

/// Reframes a nonempty root-child span without changing any contained text block.
///
/// Preserves the exact depth-first text-block sequence while changing containers.
/// Transactions and operation V7 support this operation; earlier codecs do not.
/// Complete source guards and final document limits are checked.
/// Each returned edit contains its exact inverse and snapshot-local point mapping.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct NestedListReframe {
    start: u32,
    expected: Arc<[NodeRef]>,
    replacement: Arc<[NodeRef]>,
}

impl NestedListReframe {
    pub(crate) fn apply_operation(
        &self,
        context: &EditorContext,
        document: &Document,
    ) -> Result<super::AppliedOperation, NestedListReframeError> {
        let Some(edit) = self.apply(context, document)? else {
            return Ok(super::AppliedOperation::Unchanged);
        };
        Ok(super::AppliedOperation::Changed(Box::new(super::AppliedChange {
            document: edit.document,
            inverse: super::Operation::NestedListReframe(edit.inverse),
            relocation: super::RelocationStepMap::FlatListReframe(edit.relocation),
            change: super::ChildrenChange::new(
                NodePath::root(),
                super::ChildRange::new(self.start, end(self.start, self.expected.len())?),
                super::ChildRange::new(self.start, end(self.start, self.replacement.len())?),
            )
            .into(),
        })))
    }
    /// Creates a source-guarded container-only edit.
    ///
    /// # Errors
    /// Rejects empty spans, invalid nested-list shapes, coordinate overflow, or
    /// any change to the flattened block sequence. Context validation is separate.
    pub fn try_new(
        start: u32,
        expected: Vec<NodeRef>,
        replacement: Vec<NodeRef>,
    ) -> Result<Self, NestedListReframeError> {
        end(start, expected.len())?;
        end(start, replacement.len())?;
        let source = blocks(&expected)?;
        let result = blocks(&replacement)?;
        if !source.iter().map(|(_, block)| block).eq(result.iter().map(|(_, block)| block)) {
            return Err(NestedListReframeError::ContentChanged);
        }
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
    ) -> Result<Self, NestedListReframeError> {
        require_document(context, document)?;
        let count = usize::try_from(count).map_err(|_| NestedListReframeError::InvalidTarget)?;
        let stop = usize::try_from(end(start, count)?)
            .map_err(|_| NestedListReframeError::InvalidTarget)?;
        let root = document.root().as_element().ok_or(NestedListReframeError::InvalidTarget)?;
        if stop > root.children().len() {
            return Err(NestedListReframeError::InvalidTarget);
        }
        let start_native =
            usize::try_from(start).map_err(|_| NestedListReframeError::InvalidTarget)?;
        let expected = root.children().iter().skip(start_native).take(count).cloned().collect();
        let operation = Self::try_new(start, expected, replacement)?;
        operation.validate_with_source(context, Some(document))?;
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
    /// Complete replacement roots in preserved block order.
    #[must_use]
    pub fn replacement(&self) -> &[NodeRef] {
        &self.replacement
    }

    pub(crate) fn validate(&self, context: &EditorContext) -> Result<(), NestedListReframeError> {
        self.validate_with_source(context, None)
    }

    // A source proof is only a within-call hint. Codecs still validate without
    // one, and partial spans cannot inherit the complete document's proof.
    fn validate_with_source(
        &self,
        context: &EditorContext,
        source: Option<&Document>,
    ) -> Result<(), NestedListReframeError> {
        require_schema(context)?;
        for nodes in [&self.expected, &self.replacement] {
            let stop = usize::try_from(end(self.start, nodes.len())?)
                .map_err(|_| NestedListReframeError::InvalidTarget)?;
            if stop > context.limits().max_children_per_element() {
                return Err(NestedListReframeError::RootChildLimit);
            }
            validate_roots(context, nodes, source)?;
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
    ) -> Result<Option<NestedListReframeEdit>, NestedListReframeError> {
        require_document(context, document)?;
        self.validate_with_source(context, Some(document))?;
        let document_before = document.clone();
        let old_end = end(self.start, self.expected.len())?;
        let new_end = end(self.start, self.replacement.len())?;
        let start =
            usize::try_from(self.start).map_err(|_| NestedListReframeError::InvalidTarget)?;
        let stop = usize::try_from(old_end).map_err(|_| NestedListReframeError::InvalidTarget)?;
        let root = document.root().as_element().ok_or(NestedListReframeError::InvalidTarget)?;
        if stop > root.children().len()
            || !root
                .children()
                .iter()
                .skip(start)
                .take(self.expected.len())
                .eq(self.expected.iter())
        {
            return Err(NestedListReframeError::ExpectedMismatch);
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
        let root =
            root.try_with_children(children).map_err(|_| NestedListReframeError::InvalidTarget)?;
        let document =
            Document::try_new(context.schema(), NodeRef::element(root), context.limits())?;
        let inverse = Self {
            start: self.start,
            expected: self.replacement.clone(),
            replacement: self.expected.clone(),
        };
        let paths = |nodes: &[NodeRef]| -> Result<Arc<[NodePath]>, NestedListReframeError> {
            blocks(nodes)?
                .into_iter()
                .map(|(path, _)| {
                    let mut path = path.to_vec();
                    path[0] = path[0]
                        .checked_add(self.start)
                        .ok_or(NestedListReframeError::InvalidTarget)?;
                    NodePath::try_from_indices(path)
                        .map_err(|_| NestedListReframeError::InvalidTarget)
                })
                .collect::<Result<Vec<_>, _>>()
                .map(Arc::from)
        };
        Ok(Some(NestedListReframeEdit {
            before: document_before,
            document,
            inverse,
            relocation: super::flat_list_reframe_map::FlatListReframeMap::new(
                self.start,
                old_end,
                new_end,
                paths(&self.expected)?,
                paths(&self.replacement)?,
            ),
        }))
    }
}

/// Reuse admission only for an exactly matching complete root and authority.
/// Root metadata, all children, compiled schema identity and limits must match.
fn validate_roots(
    context: &EditorContext,
    nodes: &[NodeRef],
    source: Option<&Document>,
) -> Result<Document, NestedListReframeError> {
    let root = ElementNode::try_new(
        context.schema().root_kind().clone(),
        None,
        PropertyMap::default(),
        nodes.to_vec(),
    )
    .map_err(|_| NestedListReframeError::InvalidTarget)?;
    let root = NodeRef::element(root);
    if let Some(source) = source
        && source.is_proven_for(context.schema(), context.limits())
        && source.root() == &root
    {
        return Ok(source.clone());
    }
    Ok(Document::try_new(context.schema(), root, context.limits())?)
}

#[cfg(test)]
#[path = "nested_list_reframe_proof_tests.rs"]
mod proof_tests;

fn end(start: u32, count: usize) -> Result<u32, NestedListReframeError> {
    if count == 0 {
        return Err(NestedListReframeError::InvalidTarget);
    }
    start
        .checked_add(u32::try_from(count).map_err(|_| NestedListReframeError::InvalidTarget)?)
        .ok_or(NestedListReframeError::InvalidTarget)
}

/// Bounded iterative traversal: no recursion on untrusted candidate fragments.
pub(super) fn blocks(
    roots: &[NodeRef],
) -> Result<Vec<(NodePath, &NodeRef)>, NestedListReframeError> {
    let mut result = Vec::new();
    let mut pending = Vec::new();
    for (index, node) in roots.iter().enumerate().rev() {
        let index = u32::try_from(index).map_err(|_| NestedListReframeError::InvalidTarget)?;
        pending.push((
            NodePath::try_from_indices(vec![index])
                .map_err(|_| NestedListReframeError::InvalidTarget)?,
            node,
        ));
    }
    while let Some((path, node)) = pending.pop() {
        if super::block_kind(node).is_ok() {
            result.push((path, node));
            continue;
        }
        let list = node.as_element().ok_or(NestedListReframeError::InvalidTarget)?;
        if !matches!(list.kind().as_str(), "breditor/bullet-list" | "breditor/ordered-list")
            || list.children().is_empty()
        {
            return Err(NestedListReframeError::InvalidTarget);
        }
        for (index, item) in list.children().iter().enumerate().rev() {
            let item = item.as_element().ok_or(NestedListReframeError::InvalidTarget)?;
            if item.kind().as_str() != "breditor/list-item" || item.children().is_empty() {
                return Err(NestedListReframeError::InvalidTarget);
            }
            super::block_kind(item.children().get(0).ok_or(NestedListReframeError::InvalidTarget)?)
                .map_err(|_| NestedListReframeError::InvalidTarget)?;
            let index = u32::try_from(index).map_err(|_| NestedListReframeError::InvalidTarget)?;
            let item_path =
                path.try_child(index).map_err(|_| NestedListReframeError::InvalidTarget)?;
            for (child_index, child) in item.children().iter().enumerate().rev() {
                if child_index > 0
                    && !child.as_element().is_some_and(|element| {
                        matches!(
                            element.kind().as_str(),
                            "breditor/bullet-list" | "breditor/ordered-list"
                        )
                    })
                {
                    return Err(NestedListReframeError::InvalidTarget);
                }
                let child_index = u32::try_from(child_index)
                    .map_err(|_| NestedListReframeError::InvalidTarget)?;
                pending.push((
                    item_path
                        .try_child(child_index)
                        .map_err(|_| NestedListReframeError::InvalidTarget)?,
                    child,
                ));
            }
        }
    }
    Ok(result)
}

fn require_schema(context: &EditorContext) -> Result<(), NestedListReframeError> {
    if context.schema().supports_nested_list_reframe() {
        Ok(())
    } else {
        Err(NestedListReframeError::UnsupportedSchema)
    }
}
fn require_document(
    context: &EditorContext,
    document: &Document,
) -> Result<(), NestedListReframeError> {
    require_schema(context)?;
    if let Some(error) = document.proof_mismatch(context.schema(), context.limits()) {
        return Err(error.into());
    }
    Ok(())
}

/// Failure to construct, admit or apply a nested-list container edit.
#[derive(Clone, Debug, Eq, Error, PartialEq)]
pub enum NestedListReframeError {
    /// Unsupported shape, empty span or unrepresentable coordinate.
    #[error("invalid nested-list reframe target")]
    InvalidTarget,
    /// Text blocks were changed, removed, duplicated or reordered.
    #[error("nested-list reframe must preserve the exact text-block sequence")]
    ContentChanged,
    /// The compiler did not grant the sealed nested-list capability.
    #[error("nested-list reframe requires the sealed nested-list schema")]
    UnsupportedSchema,
    /// A complete optimistic source guard no longer matches.
    #[error("nested-list reframe source guard does not match")]
    ExpectedMismatch,
    /// A root span exceeds the context's child budget.
    #[error("nested-list reframe exceeds root child limit")]
    RootChildLimit,
    /// The document proof belongs to another schema or limits.
    #[error(transparent)]
    DocumentProof(#[from] DocumentProofMismatch),
    /// Source, replacement or complete result violates schema/resource limits.
    #[error(transparent)]
    Validation(#[from] ValidationReport),
}

/// Verified immutable result of a nested container reframe; not a session commit.
#[derive(Clone, Debug)]
pub struct NestedListReframeEdit {
    before: Document,
    document: Document,
    inverse: NestedListReframe,
    relocation: super::flat_list_reframe_map::FlatListReframeMap,
}
impl NestedListReframeEdit {
    /// Resulting document, validated against the original context's limits.
    #[must_use]
    pub const fn document(&self) -> &Document {
        &self.document
    }
    /// Exact guarded inverse, including original container starts and hierarchy.
    #[must_use]
    pub const fn inverse(&self) -> &NestedListReframe {
        &self.inverse
    }
    /// Maps a source point through preserved text-block identity/order.
    /// # Errors
    /// Rejects invalid source or resulting points.
    pub fn relocate(
        &self,
        point: &crate::position::Point,
    ) -> Result<PointRelocation, RelocationError> {
        self.relocation.relocate(&self.before, &self.document, point)
    }
}

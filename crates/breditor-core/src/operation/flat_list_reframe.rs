//! Guarded list-container changes that preserve the complete text-block sequence.

use std::sync::Arc;
use thiserror::Error;

use super::{
    AppliedChange, AppliedOperation, ChildRange, ChildrenChange, Operation, RelocationStepMap,
};
use crate::{
    document::{Document, DocumentProofMismatch, ElementNode, NodeRef, PropertyMap},
    position::NodePath,
    schema::ValidationReport,
    state::EditorContext,
};

/// Reframes a nonempty root-child span without changing any contained text block.
///
/// This is the primitive for flat-list wrap, unwrap, retype and restart actions.
/// The flattened paragraph/heading sequence must be exactly equal, including
/// ranks, text runs and typed inline properties. Complete source roots are
/// optimistic guards. Source and replacement fragments and the complete final
/// document are validated against the sealed flat-list schema and resource limits.
///
/// Selection endpoints follow their preserved block, retaining their exact leaf
/// index, offset and affinity. The inverse exchanges source and result roots.
/// This experimental runtime operation has no durable encoding yet.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct FlatListReframe {
    start: u32,
    expected: Arc<[NodeRef]>,
    replacement: Arc<[NodeRef]>,
}

impl FlatListReframe {
    /// Creates a source-guarded container-only edit.
    ///
    /// # Errors
    /// Rejects empty spans, invalid flat-list shapes, coordinate overflow, or
    /// any change to the flattened block sequence. Context validation is separate.
    pub fn try_new(
        start: u32,
        expected: Vec<NodeRef>,
        replacement: Vec<NodeRef>,
    ) -> Result<Self, FlatListReframeError> {
        end(start, expected.len())?;
        end(start, replacement.len())?;
        let source = blocks(&expected)?;
        let result = blocks(&replacement)?;
        if !source.iter().map(|(_, block)| block).eq(result.iter().map(|(_, block)| block)) {
            return Err(FlatListReframeError::ContentChanged);
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
    ) -> Result<Self, FlatListReframeError> {
        require_document(context, document)?;
        let count = usize::try_from(count).map_err(|_| FlatListReframeError::InvalidTarget)?;
        let stop =
            usize::try_from(end(start, count)?).map_err(|_| FlatListReframeError::InvalidTarget)?;
        let root = document.root().as_element().ok_or(FlatListReframeError::InvalidTarget)?;
        if stop > root.children().len() {
            return Err(FlatListReframeError::InvalidTarget);
        }
        let start_native =
            usize::try_from(start).map_err(|_| FlatListReframeError::InvalidTarget)?;
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
    /// Complete replacement roots in preserved block order.
    #[must_use]
    pub fn replacement(&self) -> &[NodeRef] {
        &self.replacement
    }

    pub(crate) fn validate(&self, context: &EditorContext) -> Result<(), FlatListReframeError> {
        require_schema(context)?;
        for nodes in [&self.expected, &self.replacement] {
            let stop = usize::try_from(end(self.start, nodes.len())?)
                .map_err(|_| FlatListReframeError::InvalidTarget)?;
            if stop > context.limits().max_children_per_element() {
                return Err(FlatListReframeError::RootChildLimit);
            }
            let root = ElementNode::try_new(
                context.schema().root_kind().clone(),
                None,
                PropertyMap::default(),
                nodes.to_vec(),
            )
            .map_err(|_| FlatListReframeError::InvalidTarget)?;
            Document::try_new(context.schema(), NodeRef::element(root), context.limits())?;
        }
        Ok(())
    }

    pub(crate) fn apply(
        &self,
        context: &EditorContext,
        document: &Document,
    ) -> Result<AppliedOperation, FlatListReframeError> {
        require_document(context, document)?;
        self.validate(context)?;
        let old_end = end(self.start, self.expected.len())?;
        let new_end = end(self.start, self.replacement.len())?;
        let start = usize::try_from(self.start).map_err(|_| FlatListReframeError::InvalidTarget)?;
        let stop = usize::try_from(old_end).map_err(|_| FlatListReframeError::InvalidTarget)?;
        let root = document.root().as_element().ok_or(FlatListReframeError::InvalidTarget)?;
        if stop > root.children().len()
            || !root
                .children()
                .iter()
                .skip(start)
                .take(self.expected.len())
                .eq(self.expected.iter())
        {
            return Err(FlatListReframeError::ExpectedMismatch);
        }
        if self.expected == self.replacement {
            return Ok(AppliedOperation::Unchanged);
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
            root.try_with_children(children).map_err(|_| FlatListReframeError::InvalidTarget)?;
        let document =
            Document::try_new(context.schema(), NodeRef::element(root), context.limits())?;
        let inverse = Self {
            start: self.start,
            expected: self.replacement.clone(),
            replacement: self.expected.clone(),
        };
        let paths = |nodes: &[NodeRef]| -> Result<Arc<[NodePath]>, FlatListReframeError> {
            blocks(nodes)?
                .into_iter()
                .map(|(path, _)| {
                    let mut path = path.to_vec();
                    path[0] = path[0]
                        .checked_add(self.start)
                        .ok_or(FlatListReframeError::InvalidTarget)?;
                    NodePath::try_from_indices(path)
                        .map_err(|_| FlatListReframeError::InvalidTarget)
                })
                .collect::<Result<Vec<_>, _>>()
                .map(Arc::from)
        };
        Ok(AppliedOperation::Changed(Box::new(AppliedChange {
            document,
            inverse: Operation::FlatListReframe(inverse),
            relocation: RelocationStepMap::FlatListReframe(
                super::flat_list_reframe_map::FlatListReframeMap::new(
                    self.start,
                    old_end,
                    new_end,
                    paths(&self.expected)?,
                    paths(&self.replacement)?,
                ),
            ),
            change: ChildrenChange::new(
                NodePath::root(),
                ChildRange::new(self.start, old_end),
                ChildRange::new(self.start, new_end),
            )
            .into(),
        })))
    }
}

fn end(start: u32, count: usize) -> Result<u32, FlatListReframeError> {
    if count == 0 {
        return Err(FlatListReframeError::InvalidTarget);
    }
    start
        .checked_add(u32::try_from(count).map_err(|_| FlatListReframeError::InvalidTarget)?)
        .ok_or(FlatListReframeError::InvalidTarget)
}

/// Enumerates only the sealed flat shape; schema validation owns property and
/// text-run admission. No recursion or arbitrary-depth traversal is necessary.
fn blocks(roots: &[NodeRef]) -> Result<Vec<(NodePath, &NodeRef)>, FlatListReframeError> {
    let mut result = Vec::new();
    for (index, node) in roots.iter().enumerate() {
        let index = u32::try_from(index).map_err(|_| FlatListReframeError::InvalidTarget)?;
        let element = node.as_element().ok_or(FlatListReframeError::InvalidTarget)?;
        if super::block_kind(node).is_ok() {
            result.push((
                NodePath::try_from_indices(vec![index])
                    .map_err(|_| FlatListReframeError::InvalidTarget)?,
                node,
            ));
            continue;
        }
        if !matches!(element.kind().as_str(), "breditor/bullet-list" | "breditor/ordered-list")
            || element.children().is_empty()
        {
            return Err(FlatListReframeError::InvalidTarget);
        }
        for (item_index, item) in element.children().iter().enumerate() {
            let item = item.as_element().ok_or(FlatListReframeError::InvalidTarget)?;
            if item.kind().as_str() != "breditor/list-item" || item.children().len() != 1 {
                return Err(FlatListReframeError::InvalidTarget);
            }
            let block = item.children().iter().next().ok_or(FlatListReframeError::InvalidTarget)?;
            super::block_kind(block).map_err(|_| FlatListReframeError::InvalidTarget)?;
            let item_index =
                u32::try_from(item_index).map_err(|_| FlatListReframeError::InvalidTarget)?;
            result.push((
                NodePath::try_from_indices(vec![index, item_index, 0])
                    .map_err(|_| FlatListReframeError::InvalidTarget)?,
                block,
            ));
        }
    }
    Ok(result)
}

fn require_schema(context: &EditorContext) -> Result<(), FlatListReframeError> {
    if context.schema().supports_flat_list_operations() {
        Ok(())
    } else {
        Err(FlatListReframeError::UnsupportedSchema)
    }
}
fn require_document(
    context: &EditorContext,
    document: &Document,
) -> Result<(), FlatListReframeError> {
    require_schema(context)?;
    if let Some(error) = document.proof_mismatch(context.schema(), context.limits()) {
        return Err(error.into());
    }
    Ok(())
}

/// Failure to construct, admit or apply a flat-list container edit.
#[derive(Clone, Debug, Eq, Error, PartialEq)]
pub enum FlatListReframeError {
    /// Unsupported shape, empty span or unrepresentable coordinate.
    #[error("invalid flat-list reframe target")]
    InvalidTarget,
    /// Text blocks were changed, removed, duplicated or reordered.
    #[error("flat-list reframe must preserve the exact text-block sequence")]
    ContentChanged,
    /// The compiler did not grant the sealed flat-list capability.
    #[error("flat-list reframe requires the sealed flat-list schema")]
    UnsupportedSchema,
    /// A complete optimistic source guard no longer matches.
    #[error("flat-list reframe source guard does not match")]
    ExpectedMismatch,
    /// A root span exceeds the context's child budget.
    #[error("flat-list reframe exceeds root child limit")]
    RootChildLimit,
    /// The document proof belongs to another schema or limits.
    #[error(transparent)]
    DocumentProof(#[from] DocumentProofMismatch),
    /// Source, replacement or complete result violates schema/resource limits.
    #[error(transparent)]
    Validation(#[from] ValidationReport),
}

//! Atomic cross-block text replacement with an explicit flat-list result layout.
use super::{
    AppliedChange, AppliedOperation, ChildRange, ChildrenChange, FlatListRootShape,
    FlatListTextRange, Operation, RelocationStepMap, RootTextBoundary, RootTextRange,
    RootTextReplaceError, flat_list_layout, flat_list_reframe,
    root_text_replace::derive_replacement, text_splice::fragments_have_identical_text,
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

#[cfg(test)]
#[path = "flat_list_source_proof_tests.rs"]
mod source_proof_tests;

#[cfg(test)]
#[path = "flat_list_path_reuse_tests.rs"]
mod path_reuse_tests;

/// Replaces a range across bare/list text blocks and rebuilds only its root span.
///
/// Complete intersected root children are source guards. `inserted` contains a
/// nonempty sequence of paragraph/heading fragments: source text before/after
/// the range joins the first/last inserted block. Unselected blocks elsewhere in
/// those guarded roots remain exactly equal and in order. The explicit layout
/// consumes the resulting block sequence once, without hiding list numbering or
/// merge policy in the operation. Every source kind and wrapper is recoverable
/// through the same-type inverse. Operation V6 explicitly admits this recipe;
/// no existing wire tag is widened.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct FlatListTextReplace {
    guard_start: u32,
    range: FlatListTextRange,
    expected: Arc<[NodeRef]>,
    inserted: Arc<[NodeRef]>,
    layout: Arc<[FlatListRootShape]>,
}
impl FlatListTextReplace {
    /// Checks source shape, scalar boundaries, layout and exact inverse derivation.
    ///
    /// `guard_start` and `expected` define a contiguous span of complete root
    /// children. The edited `range` must lie inside that span, but need not touch
    /// every guarded root. `layout` covers all resulting blocks in that span,
    /// including untouched blocks before and after the text range. A wider guard
    /// is necessary when an inverse rejoins containers around an exited item.
    ///
    /// # Errors
    /// Rejects empty/mismatched spans, invalid text blocks, impossible layout,
    /// scalar splits, ordinal overflow or an inexact inverse. Schema and resource
    /// limits are checked separately against the supplied editor context.
    pub fn try_new(
        guard_start: u32,
        range: FlatListTextRange,
        expected: Vec<NodeRef>,
        inserted: Vec<NodeRef>,
        layout: Vec<FlatListRootShape>,
    ) -> Result<Self, FlatListTextReplaceError> {
        let operation = Self {
            guard_start,
            range,
            expected: expected.into(),
            inserted: inserted.into(),
            layout: layout.into(),
        };
        let derived = operation.derive()?;
        let inverse = operation.inverse(&derived)?;
        if inverse.derive()?.roots.as_slice() != operation.expected.as_ref() {
            return Err(FlatListTextReplaceError::InvalidTarget);
        }
        Ok(operation)
    }
    /// Captures every complete root child intersected by the real block paths.
    ///
    /// # Errors
    /// Rejects foreign proofs, unsupported schemas, missing roots or invalid recipes.
    pub fn capture(
        context: &EditorContext,
        document: &Document,
        range: FlatListTextRange,
        inserted: Vec<NodeRef>,
        layout: Vec<FlatListRootShape>,
    ) -> Result<Self, FlatListTextReplaceError> {
        require_document(context, document)?;
        let start = usize::try_from(range.root_start())
            .map_err(|_| FlatListTextReplaceError::InvalidTarget)?;
        let end = usize::try_from(range.root_end())
            .map_err(|_| FlatListTextReplaceError::InvalidTarget)?;
        let root = document.root().as_element().ok_or(FlatListTextReplaceError::InvalidTarget)?;
        if end > root.children().len() {
            return Err(FlatListTextReplaceError::InvalidTarget);
        }
        let expected = root.children().iter().skip(start).take(end - start).cloned().collect();
        let operation = Self::try_new(range.root_start(), range, expected, inserted, layout)?;
        operation.validate(context)?;
        Ok(operation)
    }
    /// Source range in real document block paths.
    #[must_use]
    pub const fn range(&self) -> &FlatListTextRange {
        &self.range
    }
    /// First complete guarded root. Inverses can guard beyond the edited range
    /// to restore original container boundaries after splitting a list.
    #[must_use]
    pub const fn guard_start(&self) -> u32 {
        self.guard_start
    }
    /// Complete source root guards in document order.
    #[must_use]
    pub fn expected(&self) -> &[NodeRef] {
        &self.expected
    }
    /// Inserted paragraph/heading fragments before retaining source prefix/suffix.
    #[must_use]
    pub fn inserted(&self) -> &[NodeRef] {
        &self.inserted
    }
    /// Explicit root/container partition of all result blocks in the guarded span.
    #[must_use]
    pub fn layout(&self) -> &[FlatListRootShape] {
        &self.layout
    }

    pub(crate) fn validate(&self, context: &EditorContext) -> Result<(), FlatListTextReplaceError> {
        self.validate_and_derive(context, None).map(|_| ())
    }

    /// Retains the exact replacement already reconstructed for result validation.
    /// No proof is cached across operations or contexts. A source document may
    /// prove only an exactly equal reconstructed source root under the same
    /// compiled schema and limits. Otherwise validate that root afresh. Retain
    /// the independently validated result document too: if
    /// the final root is exactly equal, it already has the complete proof for
    /// this call's context and limits; otherwise validate the final root afresh.
    fn validate_and_derive(
        &self,
        context: &EditorContext,
        source: Option<&Document>,
    ) -> Result<(Derived, Document), FlatListTextReplaceError> {
        require_schema(context)?;
        let maximum =
            u64::try_from(context.limits().max_children_per_element()).unwrap_or(u64::MAX);
        if u64::from(self.guard_end()?) > maximum || u64::from(self.result_end()?) > maximum {
            return Err(FlatListTextReplaceError::RootChildLimit);
        }
        validate_roots(context, self.expected.to_vec(), source)?;
        let derived = self.derive()?;
        let validated_result = validate_roots(context, derived.roots.clone(), None)?;
        Ok((derived, validated_result))
    }
    pub(crate) fn apply(
        &self,
        context: &EditorContext,
        document: &Document,
    ) -> Result<AppliedOperation, FlatListTextReplaceError> {
        require_document(context, document)?;
        let (derived, validated_result) = self.validate_and_derive(context, Some(document))?;
        let start = usize::try_from(self.guard_start)
            .map_err(|_| FlatListTextReplaceError::InvalidTarget)?;
        let end = usize::try_from(self.guard_end()?)
            .map_err(|_| FlatListTextReplaceError::InvalidTarget)?;
        let root = document.root().as_element().ok_or(FlatListTextReplaceError::InvalidTarget)?;
        if end > root.children().len()
            || !root
                .children()
                .iter()
                .skip(start)
                .take(self.expected.len())
                .eq(self.expected.iter())
        {
            return Err(FlatListTextReplaceError::ExpectedMismatch);
        }
        if derived.roots.as_slice() == self.expected.as_ref() {
            return Ok(AppliedOperation::Unchanged);
        }
        let inverse = self.inverse(&derived)?;
        let children = root
            .children()
            .iter()
            .take(start)
            .cloned()
            .chain(derived.roots.iter().cloned())
            .chain(root.children().iter().skip(end).cloned())
            .collect();
        let root = root
            .try_with_children(children)
            .map_err(|_| FlatListTextReplaceError::InvalidTarget)?;
        let root = NodeRef::element(root);
        // Complete semantic equality includes root kind, identity, properties
        // and all children. A partial guarded span with retained siblings is
        // not this document and must still pass the full aggregate limits.
        let document = if &root == validated_result.root() {
            validated_result
        } else {
            Document::try_new(context.schema(), root, context.limits())?
        };
        let inserted = fragments(&self.inserted)?;
        let last = inserted.last().ok_or(FlatListTextReplaceError::InvalidTarget)?.utf16_len();
        let after_offset = if inserted.len() == 1 {
            self.range.start_offset().checked_add(last.get()).map_err(RootTextReplaceError::from)?
        } else {
            last
        };
        Ok(AppliedOperation::Changed(Box::new(AppliedChange {
            document,
            inverse: Operation::FlatListTextReplace(inverse),
            relocation: RelocationStepMap::FlatListTextReplace(
                super::flat_list_text_replace_map::FlatListTextReplaceMap {
                    root_start: self.guard_start,
                    old_end: self.guard_end()?,
                    new_end: self.result_end()?,
                    range: derived.flat_range,
                    after_offset,
                    inserted_count: u32::try_from(inserted.len())
                        .map_err(|_| FlatListTextReplaceError::InvalidTarget)?,
                    source_paths: derived.source_paths,
                    result_paths: derived.result_paths,
                    preserves_text: derived.preserves_text,
                },
            ),
            change: ChildrenChange::new(
                NodePath::root(),
                ChildRange::new(self.guard_start, self.guard_end()?),
                ChildRange::new(self.guard_start, self.result_end()?),
            )
            .into(),
        })))
    }
    fn result_end(&self) -> Result<u32, FlatListTextReplaceError> {
        self.guard_start
            .checked_add(
                u32::try_from(self.layout.len())
                    .map_err(|_| FlatListTextReplaceError::InvalidLayout)?,
            )
            .ok_or(FlatListTextReplaceError::InvalidLayout)
    }
    fn guard_end(&self) -> Result<u32, FlatListTextReplaceError> {
        if self.expected.is_empty() {
            return Err(FlatListTextReplaceError::InvalidTarget);
        }
        self.guard_start
            .checked_add(
                u32::try_from(self.expected.len())
                    .map_err(|_| FlatListTextReplaceError::InvalidTarget)?,
            )
            .ok_or(FlatListTextReplaceError::InvalidTarget)
    }
    fn derive(&self) -> Result<Derived, FlatListTextReplaceError> {
        if self.range.root_start() < self.guard_start || self.range.root_end() > self.guard_end()? {
            return Err(FlatListTextReplaceError::InvalidTarget);
        }
        self.result_end()?;
        let source = flat_list_reframe::blocks(&self.expected)
            .map_err(|_| FlatListTextReplaceError::InvalidTarget)?;
        // `blocks` already admitted every wrapper and block kind. Reuse its
        // paths instead of walking and allocating the complete guarded span a
        // second time. No shape, text, schema or inverse check is skipped.
        let source_paths = offset_paths(source.iter().map(|(path, _)| path), self.guard_start)?;
        let first = source_paths
            .iter()
            .position(|path| path == self.range.start_path())
            .ok_or(FlatListTextReplaceError::InvalidTarget)?;
        let last = source_paths
            .iter()
            .position(|path| path == self.range.end_path())
            .ok_or(FlatListTextReplaceError::InvalidTarget)?;
        if first > last {
            return Err(FlatListTextReplaceError::InvalidTarget);
        }
        let guarded =
            source[first..=last].iter().map(|(_, node)| (*node).clone()).collect::<Vec<_>>();
        let flat_range = RootTextRange::try_new(
            RootTextBoundary::try_new(
                NodePath::try_from_indices(vec![
                    u32::try_from(first).map_err(|_| FlatListTextReplaceError::InvalidTarget)?,
                ])
                .map_err(|_| FlatListTextReplaceError::InvalidTarget)?,
                self.range.start_offset(),
            )
            .map_err(|_| FlatListTextReplaceError::InvalidTarget)?,
            RootTextBoundary::try_new(
                NodePath::try_from_indices(vec![
                    u32::try_from(last).map_err(|_| FlatListTextReplaceError::InvalidTarget)?,
                ])
                .map_err(|_| FlatListTextReplaceError::InvalidTarget)?,
                self.range.end_offset(),
            )
            .map_err(|_| FlatListTextReplaceError::InvalidTarget)?,
        )
        .map_err(|_| FlatListTextReplaceError::InvalidTarget)?;
        let guarded_text = fragments(&guarded)?;
        let edit = derive_replacement(&flat_range, &guarded_text, &fragments(&self.inserted)?)?;
        let edited = rebuild(&self.inserted, &edit.result)?;
        let nodes = source[..first]
            .iter()
            .map(|(_, node)| (*node).clone())
            .chain(edited)
            .chain(source[last + 1..].iter().map(|(_, node)| (*node).clone()))
            .collect::<Vec<_>>();
        let roots = flat_list_layout::build(&self.layout, &nodes, &self.expected)?;
        let result_paths = absolute_paths(&roots, self.guard_start)?;
        let inverse_end = first
            .checked_add(self.inserted.len())
            .and_then(|n| n.checked_sub(1))
            .ok_or(FlatListTextReplaceError::InvalidLayout)?;
        let inverse_range = FlatListTextRange::try_new(
            result_paths.get(first).ok_or(FlatListTextReplaceError::InvalidLayout)?.clone(),
            edit.inverse_range.start().offset(),
            result_paths.get(inverse_end).ok_or(FlatListTextReplaceError::InvalidLayout)?.clone(),
            edit.inverse_range.end().offset(),
        )
        .map_err(|_| FlatListTextReplaceError::InvalidLayout)?;
        let preserves_text = if source.len() == nodes.len() {
            // Untouched blocks are exact immutable clones, but try_new must
            // still admit their complete canonical fragment contract. Borrow
            // them instead of copying every text run merely to discard it.
            for (_, node) in source[..first].iter().chain(&source[last + 1..]) {
                validate_fragment(node)?;
            }
            // The edited span was already admitted above. Rebuild uses exactly
            // edit.result, so compare these fragments without reparsing nodes.
            guarded_text
                .iter()
                .zip(&edit.result)
                .all(|(left, right)| fragments_have_identical_text(left, right))
        } else {
            false
        };
        Ok(Derived {
            roots,
            flat_range,
            inverse_range,
            removed: rebuild(&guarded, &edit.removed)?,
            source_paths,
            result_paths,
            preserves_text,
        })
    }
    fn inverse(&self, derived: &Derived) -> Result<Self, FlatListTextReplaceError> {
        Ok(Self {
            guard_start: self.guard_start,
            range: derived.inverse_range.clone(),
            expected: derived.roots.clone().into(),
            inserted: derived.removed.clone().into(),
            layout: flat_list_layout::capture(&self.expected)?.into(),
        })
    }
}
struct Derived {
    roots: Vec<NodeRef>,
    flat_range: RootTextRange,
    inverse_range: FlatListTextRange,
    removed: Vec<NodeRef>,
    source_paths: Arc<[NodePath]>,
    result_paths: Arc<[NodePath]>,
    preserves_text: bool,
}
fn absolute_paths(
    roots: &[NodeRef],
    start: u32,
) -> Result<Arc<[NodePath]>, FlatListTextReplaceError> {
    let blocks =
        flat_list_reframe::blocks(roots).map_err(|_| FlatListTextReplaceError::InvalidTarget)?;
    offset_paths(blocks.iter().map(|(path, _)| path), start)
}
/// Converts already-admitted relative block paths to document coordinates.
/// Zero-origin paths can retain their immutable allocation; nonzero origins
/// still check root-index overflow and preserve every descendant index.
fn offset_paths<'a>(
    paths: impl Iterator<Item = &'a NodePath>,
    start: u32,
) -> Result<Arc<[NodePath]>, FlatListTextReplaceError> {
    paths
        .map(|path| {
            if start == 0 {
                return Ok(path.clone());
            }
            let mut path = path.to_vec();
            path[0] = path[0].checked_add(start).ok_or(FlatListTextReplaceError::InvalidTarget)?;
            NodePath::try_from_indices(path).map_err(|_| FlatListTextReplaceError::InvalidTarget)
        })
        .collect::<Result<Vec<_>, _>>()
        .map(Arc::from)
}
fn fragments(nodes: &[NodeRef]) -> Result<Vec<TextFragment>, FlatListTextReplaceError> {
    nodes
        .iter()
        .map(|node| {
            super::block_kind(node).map_err(|_| FlatListTextReplaceError::InvalidTarget)?;
            let runs = node
                .as_element()
                .ok_or(FlatListTextReplaceError::InvalidTarget)?
                .children()
                .iter()
                .map(|node| {
                    node.as_text()
                        .map(TextRun::from_text_node)
                        .ok_or(FlatListTextReplaceError::InvalidTarget)
                })
                .collect::<Result<Vec<_>, _>>()?;
            TextFragment::try_from_runs(runs).map_err(|_| FlatListTextReplaceError::InvalidTarget)
        })
        .collect()
}
fn validate_fragment(node: &NodeRef) -> Result<(), FlatListTextReplaceError> {
    super::block_kind(node).map_err(|_| FlatListTextReplaceError::InvalidTarget)?;
    let children = node.as_element().ok_or(FlatListTextReplaceError::InvalidTarget)?.children();
    if children.iter().any(|node| node.as_text().is_none()) {
        return Err(FlatListTextReplaceError::InvalidTarget);
    }
    TextFragment::validate_text_nodes(|| children.iter().filter_map(NodeRef::as_text))
        .map_err(|_| FlatListTextReplaceError::InvalidTarget)
}
fn rebuild(
    templates: &[NodeRef],
    fragments: &[TextFragment],
) -> Result<Vec<NodeRef>, FlatListTextReplaceError> {
    if templates.len() != fragments.len() {
        return Err(FlatListTextReplaceError::InvalidTarget);
    }
    templates
        .iter()
        .zip(fragments)
        .map(|(node, text)| {
            node.as_element()
                .ok_or(FlatListTextReplaceError::InvalidTarget)?
                .try_with_children(
                    text.iter().cloned().map(|run| NodeRef::text(run.into_text_node())).collect(),
                )
                .map(NodeRef::element)
                .map_err(|_| FlatListTextReplaceError::InvalidTarget)
        })
        .collect()
}
fn require_schema(context: &EditorContext) -> Result<(), FlatListTextReplaceError> {
    if context.schema().supports_flat_list_operations() {
        Ok(())
    } else {
        Err(FlatListTextReplaceError::UnsupportedSchema)
    }
}
fn require_document(
    context: &EditorContext,
    document: &Document,
) -> Result<(), FlatListTextReplaceError> {
    require_schema(context)?;
    if let Some(error) = document.proof_mismatch(context.schema(), context.limits()) {
        return Err(error.into());
    }
    Ok(())
}
fn validate_roots(
    context: &EditorContext,
    roots: Vec<NodeRef>,
    source: Option<&Document>,
) -> Result<Document, FlatListTextReplaceError> {
    let root = ElementNode::try_new(
        context.schema().root_kind().clone(),
        None,
        PropertyMap::default(),
        roots,
    )
    .map_err(|_| FlatListTextReplaceError::InvalidTarget)?;
    let root = NodeRef::element(root);
    if let Some(source) = source
        && source.is_proven_for(context.schema(), context.limits())
        && source.root() == &root
    {
        return Ok(source.clone());
    }
    Ok(Document::try_new(context.schema(), root, context.limits())?)
}
/// Invalid flat-list structural replacement recipe or publication.
#[derive(Clone, Debug, Eq, Error, PartialEq)]
pub enum FlatListTextReplaceError {
    /// Source paths, source cardinality, or text-block kinds are invalid.
    #[error("invalid flat-list text replacement target")]
    InvalidTarget,
    /// Layout does not consume every result block exactly once or exceeds coordinates.
    #[error("invalid flat-list replacement layout")]
    InvalidLayout,
    /// Result ordered-list final ordinal cannot be represented.
    #[error("flat-list replacement ordinal overflow")]
    OrdinalOverflow,
    /// The exact sealed flat-list capability is absent.
    #[error("flat-list replacement requires the sealed flat-list schema")]
    UnsupportedSchema,
    /// Complete root guards differ from the current document.
    #[error("flat-list replacement source guard does not match")]
    ExpectedMismatch,
    /// Root span exceeds the context child budget.
    #[error("flat-list replacement root child limit exceeded")]
    RootChildLimit,
    /// Document uses a different schema or limits proof.
    #[error(transparent)]
    DocumentProof(#[from] DocumentProofMismatch),
    /// Fragment or full-document admission failed.
    #[error(transparent)]
    Validation(#[from] ValidationReport),
    /// Scalar boundaries, text seams or inverse text derivation failed.
    #[error(transparent)]
    Text(#[from] RootTextReplaceError),
}

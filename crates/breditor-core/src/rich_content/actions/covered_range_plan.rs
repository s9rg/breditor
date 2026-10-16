//! Native cross-container trimming with explicit structural floors, never an authored root register.
use super::{RichActionError, replace_text_range::ordered, text_patch};
use crate::{
    document::{NodeRef, TextFragment},
    position::Affinity,
    rich_content::{
        BlockId, RichBlockDraft, RichCoverageExtent, RichCoveredText, RichDocument, RichSelection,
        RichSelectionCoverage, RichSelectionKind, RichTextPoint, ast_properties,
        rich_text_mapping::RichTextMap,
    },
};
use std::collections::{BTreeMap, BTreeSet};
#[cfg(test)]
mod tests;

/// One empty paragraph required by a retained cell/body or an item's required prose head.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RichRangeFloor {
    parent: Option<BlockId>,
    before: Option<BlockId>,
}
impl RichRangeFloor {
    /// Existing structural flow owner; `None` denotes document flow.
    #[must_use]
    pub const fn parent(&self) -> Option<&BlockId> {
        self.parent.as_ref()
    }
    /// Insert before this retained direct child, or append when absent.
    #[must_use]
    pub const fn before(&self) -> Option<&BlockId> {
        self.before.as_ref()
    }
}

#[derive(Clone, Debug)]
enum Tree {
    Keep(NodeRef),
    Branch(NodeRef, Vec<usize>),
    Floor(usize),
}
impl Tree {
    fn kind(&self) -> Result<&str, RichActionError> {
        match self {
            Self::Keep(node) | Self::Branch(node, _) => {
                Ok(node.as_element().ok_or(RichActionError::Rewrite)?.kind().as_str())
            }
            Self::Floor(_) => Ok("breditor/paragraph"),
        }
    }
    fn identity(&self) -> Result<Option<BlockId>, RichActionError> {
        match self {
            Self::Keep(node) | Self::Branch(node, _) => identity(node),
            Self::Floor(_) => Err(RichActionError::Rewrite),
        }
    }
}

/// Snapshot-proved cross-container text replacement, preserving partial structural owners.
///
/// Unlike the original sibling-range join, distinct boundary blocks stay distinct.
/// Their prefix/suffix, kinds, metadata and structural owners survive. Fully enclosed
/// subtrees are removed. A partially crossed table retains every axis, header and merge;
/// emptied base bodies receive fresh paragraphs. Partial list/task items retain a prose
/// head without flattening their unselected tail. Code never silently loses formats.
/// This is a local semantic plan, not a serialized selection or shared root replacement.
#[derive(Clone, Debug)]
pub struct RichRangeReplacementPlan {
    pub(super) source: RichDocument,
    tree: Vec<Tree>,
    root: usize,
    ranges: Vec<RichCoveredText>,
    deletes: Vec<BlockId>,
    floors: Vec<RichRangeFloor>,
    pub(super) maps: Vec<RichTextMap>,
    inserted: TextFragment,
    start: RichTextPoint,
    pub(super) original_end: RichTextPoint,
}
impl RichRangeReplacementPlan {
    /// Derive complete removal and retention solely from an admitted native text range.
    /// No IDs are allocated until the caller supplies exactly the requested floors.
    /// # Errors
    /// Rejects stale/foreign selections, non-text selections or an internal AST contradiction.
    pub fn capture(
        document: &RichDocument,
        selection: &RichSelection,
        inserted: &TextFragment,
    ) -> Result<Self, RichActionError> {
        selection.resolve(document)?;
        let RichSelectionKind::TextRange { anchor, focus } = selection.kind() else {
            return Err(RichActionError::SelectionKind);
        };
        let (start, end) = ordered(document, anchor, focus)?;
        let coverage = RichSelectionCoverage::capture(document, selection)?;
        let mut builder = Builder {
            covered: coverage
                .nodes()
                .iter()
                .map(|node| (node.block().clone(), node.extent()))
                .collect(),
            spans: coverage.text().iter().map(|span| (span.block().clone(), span)).collect(),
            start: start.block(),
            inserted,
            ranges: vec![],
            deletes: vec![],
            floors: vec![],
            maps: vec![],
            tree: vec![],
        };
        let root = builder.walk(document.document().root())?;
        Ok(Self {
            source: document.clone(),
            tree: builder.tree,
            root,
            ranges: builder.ranges,
            deletes: builder.deletes,
            floors: builder.floors,
            maps: builder.maps,
            inserted: inserted.clone(),
            start: start.clone(),
            original_end: end.clone(),
        })
    }
    /// Changed retained text blocks, in source order. Unchanged replacements are omitted.
    /// Insert runs only for a returned range whose block equals `insertion_start`.
    #[must_use]
    pub fn text_ranges(&self) -> &[RichCoveredText] {
        &self.ranges
    }
    /// Maximal removed subtree roots; descendants are not separately deleted.
    #[must_use]
    pub fn deleted_blocks(&self) -> &[BlockId] {
        &self.deletes
    }
    /// Fresh paragraph requirements, addressed by stable retained owners.
    #[must_use]
    pub fn empty_blocks(&self) -> &[RichRangeFloor] {
        &self.floors
    }
    /// Logical beginning of the range, independent of its anchor/focus direction.
    #[must_use]
    pub const fn insertion_start(&self) -> &RichTextPoint {
        &self.start
    }
    /// Exact inserted rich runs; their formats still need final schema admission.
    #[must_use]
    pub const fn inserted(&self) -> &TextFragment {
        &self.inserted
    }
    /// Native semantic work count; callers must retain transaction/group budgets.
    #[must_use]
    pub fn operation_count(&self) -> usize {
        self.maps.len().saturating_add(self.deletes.len()).saturating_add(self.floors.len())
    }
    /// Collapsed forward caret after insertion into the logical first text block.
    /// # Errors
    /// Rejects an offset overflow rather than rounding a coordinate.
    pub fn insertion_end(&self) -> Result<RichTextPoint, RichActionError> {
        Ok(RichTextPoint::new(
            self.start.block().clone(),
            self.start
                .offset()
                .checked_add(self.inserted.utf16_len().get())
                .map_err(|_| RichActionError::TextRange)?,
            Affinity::After,
        ))
    }
    pub(super) fn finish(&self, ids: &[BlockId]) -> Result<Vec<NodeRef>, RichActionError> {
        let mut used = BTreeSet::new();
        if ids.len() != self.floors.len()
            || ids.iter().any(|id| self.source.block_path(id).is_some() || !used.insert(id))
        {
            return Err(RichActionError::RangeFloorIds);
        }
        // Arena entries are postordered. No recursive descent is needed even when
        // an embedding host admits a document deeper than the ordinary 64-level limit.
        let mut nodes: Vec<NodeRef> = Vec::with_capacity(self.tree.len());
        for entry in &self.tree {
            let node = match entry {
                Tree::Keep(node) => node.clone(),
                Tree::Branch(node, children) => NodeRef::element(
                    node.as_element()
                        .ok_or(RichActionError::Rewrite)?
                        .try_with_children(
                            children
                                .iter()
                                .map(|child| {
                                    nodes.get(*child).cloned().ok_or(RichActionError::Rewrite)
                                })
                                .collect::<Result<Vec<_>, _>>()?,
                        )
                        .map_err(|_| RichActionError::Rewrite)?,
                ),
                Tree::Floor(index) => RichBlockDraft::paragraph(
                    ids.get(*index).ok_or(RichActionError::RangeFloorIds)?,
                    &TextFragment::empty(),
                )?
                .into_node(),
            };
            nodes.push(node);
        }
        Ok(nodes
            .get(self.root)
            .ok_or(RichActionError::Rewrite)?
            .as_element()
            .ok_or(RichActionError::Rewrite)?
            .children()
            .to_vec())
    }
}

struct Builder<'a> {
    covered: BTreeMap<BlockId, RichCoverageExtent>,
    spans: BTreeMap<BlockId, &'a RichCoveredText>,
    start: &'a BlockId,
    inserted: &'a TextFragment,
    ranges: Vec<RichCoveredText>,
    deletes: Vec<BlockId>,
    floors: Vec<RichRangeFloor>,
    maps: Vec<RichTextMap>,
    tree: Vec<Tree>,
}
struct Frame {
    node: NodeRef,
    next: usize,
    children: Vec<usize>,
}
impl Frame {
    fn new(node: &NodeRef) -> Self {
        Self { node: node.clone(), next: 0, children: vec![] }
    }
}
enum Decision {
    Removed,
    Retained(usize),
    Descend,
}
fn identity(node: &NodeRef) -> Result<Option<BlockId>, RichActionError> {
    let node = node.as_element().ok_or(RichActionError::Rewrite)?;
    if node.kind().as_str() == "breditor/document" {
        return Ok(None);
    }
    Ok(Some(
        BlockId::try_new(
            ast_properties::string(node, "block-id").map_err(|_| RichActionError::Rewrite)?,
        )
        .map_err(|_| RichActionError::Rewrite)?,
    ))
}
impl Builder<'_> {
    fn push(&mut self, entry: Tree) -> usize {
        let index = self.tree.len();
        self.tree.push(entry);
        index
    }
    fn walk(&mut self, root: &NodeRef) -> Result<usize, RichActionError> {
        let mut stack = vec![Frame::new(root)];
        loop {
            let frame = stack.last_mut().ok_or(RichActionError::Rewrite)?;
            let child = frame
                .node
                .as_element()
                .ok_or(RichActionError::Rewrite)?
                .children()
                .get(frame.next)
                .cloned();
            if let Some(child) = child {
                frame.next += 1;
                match self.leaf(&child)? {
                    Decision::Removed => {}
                    Decision::Retained(index) => {
                        stack.last_mut().ok_or(RichActionError::Rewrite)?.children.push(index);
                    }
                    Decision::Descend => stack.push(Frame::new(&child)),
                }
            } else {
                let frame = stack.pop().ok_or(RichActionError::Rewrite)?;
                let index = self.branch(frame)?;
                if let Some(parent) = stack.last_mut() {
                    parent.children.push(index);
                } else {
                    return Ok(index);
                }
            }
        }
    }
    fn leaf(&mut self, node: &NodeRef) -> Result<Decision, RichActionError> {
        let element = node.as_element().ok_or(RichActionError::Rewrite)?;
        let id = identity(node)?;
        let kind = element.kind().as_str();
        if let Some(id) = &id {
            match self.covered.get(id) {
                None => return Ok(Decision::Retained(self.push(Tree::Keep(node.clone())))),
                Some(RichCoverageExtent::Whole)
                    if !matches!(kind, "breditor/table-row" | "breditor/table-cell") =>
                {
                    self.deletes.push(id.clone());
                    return Ok(Decision::Removed);
                }
                _ => {}
            }
            if let Some(span) = self.spans.get(id).copied() {
                let old = text_patch::fragment(node)?;
                let (prefix, tail) =
                    old.split_at(span.start()).map_err(|_| RichActionError::TextRange)?;
                let suffix = tail
                    .split_at(
                        crate::position::TextOffset::try_new(
                            span.end()
                                .get()
                                .checked_sub(span.start().get())
                                .ok_or(RichActionError::TextRange)?,
                        )
                        .map_err(|_| RichActionError::TextRange)?,
                    )
                    .map_err(|_| RichActionError::TextRange)?
                    .1;
                let inserted =
                    if id == self.start { self.inserted.clone() } else { TextFragment::empty() };
                let text = prefix
                    .try_concat(&inserted)
                    .and_then(|value| value.try_concat(&suffix))
                    .map_err(|_| RichActionError::TextPrimitive)?;
                let after = text_patch::text_node(node, &text)?;
                if &after != node {
                    self.maps.push(RichTextMap {
                        block: id.clone(),
                        start: span.start(),
                        end: span.end(),
                        inserted: inserted.utf16_len(),
                        before: node.clone(),
                        after: after.clone(),
                    });
                    self.ranges.push(span.clone());
                }
                return Ok(Decision::Retained(self.push(Tree::Keep(after))));
            }
        }
        Ok(Decision::Descend)
    }
    fn branch(&mut self, frame: Frame) -> Result<usize, RichActionError> {
        let Frame { node, mut children, .. } = frame;
        let kind = node.as_element().ok_or(RichActionError::Rewrite)?.kind().as_str();
        let id = identity(&node)?;
        if children.is_empty()
            && matches!(
                kind,
                "breditor/document"
                    | "breditor/table-cell"
                    | "breditor/blockquote"
                    | "breditor/list-item"
                    | "breditor/task-item"
            )
        {
            children.push(self.floor(id.clone(), None));
        }
        if matches!(kind, "breditor/list-item" | "breditor/task-item")
            && self.tree[*children.first().ok_or(RichActionError::Rewrite)?].kind()?
                != "breditor/paragraph"
            && self.tree[*children.first().ok_or(RichActionError::Rewrite)?].kind()?
                != "breditor/heading"
        {
            let before =
                self.tree[*children.first().ok_or(RichActionError::Rewrite)?].identity()?;
            children.insert(0, self.floor(id, before));
        }
        Ok(self.push(Tree::Branch(node, children)))
    }
    fn floor(&mut self, parent: Option<BlockId>, before: Option<BlockId>) -> usize {
        let index = self.floors.len();
        self.floors.push(RichRangeFloor { parent, before });
        self.push(Tree::Floor(index))
    }
}

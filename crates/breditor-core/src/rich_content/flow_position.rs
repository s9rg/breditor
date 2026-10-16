//! Stable insertion parents and sibling anchors, independent of AST/DOM indexes.

use super::{BlockId, CellId, RichDocument};
use crate::position::NodePath;

/// A rich flow container, not an arbitrary element path.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum RichFlowParent {
    /// This document's root flow sequence.
    Document,
    /// One base cell's nonempty flow sequence, including covered cells.
    Cell(CellId),
    /// One rich list item's leading text block and subsequent flow sequence.
    ListItem(BlockId),
    /// One V2 blockquote's nonempty flow sequence.
    Blockquote(BlockId),
    /// One V2 task item's leading prose and trailing rich flow.
    TaskItem(BlockId),
}

impl RichFlowParent {
    pub(crate) fn path(&self, document: &RichDocument) -> Option<NodePath> {
        match self {
            Self::Document => Some(NodePath::root()),
            Self::Cell(cell) => document.cell_path(cell).cloned(),
            Self::ListItem(id) => document
                .block_path(id)
                .filter(|path| {
                    document
                        .document()
                        .node_at(path)
                        .ok()
                        .and_then(crate::document::NodeRef::as_element)
                        .is_some_and(|node| node.kind().as_str() == "breditor/list-item")
                })
                .cloned(),
            Self::Blockquote(id) | Self::TaskItem(id) => document
                .block_path(id)
                .filter(|path| {
                    let expected = if matches!(self, Self::Blockquote(_)) {
                        "breditor/blockquote"
                    } else {
                        "breditor/task-item"
                    };
                    document
                        .document()
                        .node_at(path)
                        .ok()
                        .and_then(crate::document::NodeRef::as_element)
                        .is_some_and(|node| node.kind().as_str() == expected)
                })
                .cloned(),
        }
    }
    pub(crate) fn at_path(document: &RichDocument, path: &NodePath) -> Option<Self> {
        if path.is_root() {
            return Some(Self::Document);
        }
        let element = document.document().node_at(path).ok()?.as_element()?;
        match element.kind().as_str() {
            "breditor/table-cell" => document
                .cell_entries()
                .find(|(_, candidate)| *candidate == path)
                .map(|(cell, _)| Self::Cell(cell.clone())),
            "breditor/list-item" => Some(Self::ListItem(
                BlockId::try_new(super::ast_properties::string(element, "block-id").ok()?).ok()?,
            )),
            "breditor/blockquote" => Some(Self::Blockquote(
                BlockId::try_new(super::ast_properties::string(element, "block-id").ok()?).ok()?,
            )),
            "breditor/task-item" => Some(Self::TaskItem(
                BlockId::try_new(super::ast_properties::string(element, "block-id").ok()?).ok()?,
            )),
            _ => None,
        }
    }
}

/// One candidate insertion point using a stable direct-child before-anchor.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RichFlowPosition {
    parent: RichFlowParent,
    before: Option<BlockId>,
}

impl RichFlowPosition {
    /// Insert before a direct flow child, or append when no anchor is supplied.
    #[must_use]
    pub const fn new(parent: RichFlowParent, before: Option<BlockId>) -> Self {
        Self { parent, before }
    }
    /// Stable flow parent; scope/shape are checked when the action is captured.
    #[must_use]
    pub const fn parent(&self) -> &RichFlowParent {
        &self.parent
    }
    /// Stable direct-child anchor; `None` means append.
    #[must_use]
    pub const fn before(&self) -> Option<&BlockId> {
        self.before.as_ref()
    }
}

impl RichDocument {
    /// Resolve a direct flow-child before-anchor in this immutable snapshot.
    ///
    /// Captions and structural row/cell/list-item targets are not general flow children;
    /// missing or unsupported targets return `None`. The returned coordinates
    /// are checked again when a structural action is captured and published.
    #[must_use]
    pub fn flow_position_before(&self, block: &BlockId) -> Option<RichFlowPosition> {
        let path = self.block_path(block)?;
        let parent = path.parent()?;
        let parent = RichFlowParent::at_path(self, &parent)?;
        Some(RichFlowPosition::new(parent, Some(block.clone())))
    }

    /// Resolve the flow gap immediately after one direct child, retaining its next sibling.
    ///
    /// A caption, row, cell or item is not a general flow child. This is a
    /// snapshot-local read, not mutation authority; capture an action against
    /// the same document and publish under its owner's exact observation.
    #[must_use]
    pub fn flow_position_after(&self, block: &BlockId) -> Option<RichFlowPosition> {
        let path = self.block_path(block)?;
        let parent_path = path.parent()?;
        let parent = RichFlowParent::at_path(self, &parent_path)?;
        let children = self.document().node_at(&parent_path).ok()?.as_element()?.children();
        let next = usize::try_from(path.last_index()?).ok()?.checked_add(1)?;
        let before = match children.get(next) {
            Some(node) => Some(
                BlockId::try_new(
                    super::ast_properties::string(node.as_element()?, "block-id").ok()?,
                )
                .ok()?,
            ),
            None => None,
        };
        Some(RichFlowPosition::new(parent, before))
    }
}

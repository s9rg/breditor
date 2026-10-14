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

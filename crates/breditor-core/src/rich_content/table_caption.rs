//! Candidate rich V4 table captions (`breditor/table` → trailing `breditor/paragraph`).
//!
//! A V4 table's children are its rows (children `0..rows`, bounds unchanged) followed
//! by at most one paragraph: the table's caption. Rows therefore keep their child
//! indices, and a row inserted "at the end" lands before the caption. The caption is
//! an ordinary paragraph block (stable identity, inline formats, text language,
//! mentions, block layout) mirroring the image caption, but it is never a flow child:
//! it cannot be split, joined, converted, moved or wrapped, and grid selections never
//! include it. V1–V3 grammars admit only rows below a table.
use super::{BlockId, RichDocument, TableId, ast_properties};
use crate::document::{ElementNode, NodeRef};

/// Payload-free table-caption failure.
#[derive(Clone, Copy, Debug, Eq, PartialEq, thiserror::Error)]
pub enum RichTableCaptionError {
    /// The explicit rich V4 candidate profile is required; old profiles never widen.
    #[error("table captions require the explicit rich V4 profile")]
    Profile,
    /// The target table is absent (or, for a caption, the block is not a table caption).
    #[error("table caption action requires an existing table")]
    Target,
    /// Adding a caption to a table that already has one is refused, never replaced.
    #[error("the table already has a caption")]
    Exists,
}

/// Whether `node` is the caption paragraph of a table (a paragraph directly below a table).
pub(crate) fn is_caption_child(node: &NodeRef) -> bool {
    node.as_element().is_some_and(|element| element.kind().as_str() == "breditor/paragraph")
}

/// The caption paragraph of one table element, if any (always the last child).
pub(crate) fn caption(table: &ElementNode) -> Option<&ElementNode> {
    table
        .children()
        .as_slice()
        .last()
        .filter(|node| is_caption_child(node))
        .and_then(NodeRef::as_element)
}

/// The row children of one table element, excluding any trailing caption.
pub(crate) fn rows(table: &ElementNode) -> &[NodeRef] {
    let children = table.children().as_slice();
    match children.last() {
        Some(last) if is_caption_child(last) => &children[..children.len() - 1],
        _ => children,
    }
}

/// Identity of the caption paragraph of `table`, if any.
pub(crate) fn caption_id(table: &ElementNode) -> Option<BlockId> {
    BlockId::try_new(ast_properties::string(caption(table)?, "block-id").ok()?).ok()
}

/// The table that directly owns `block`, when `block` is a table caption.
#[must_use]
pub(crate) fn owner_of_caption(document: &RichDocument, block: &BlockId) -> Option<TableId> {
    let path = document.block_path(block)?;
    let node = document.document().node_at(path).ok()?;
    if !is_caption_child(node) {
        return None;
    }
    let parent = document.document().node_at(&path.parent()?).ok()?.as_element()?;
    if parent.kind().as_str() != "breditor/table" {
        return None;
    }
    TableId::try_new(ast_properties::string(parent, "table-id").ok()?).ok()
}

/// Resolve one admitted table element by identity.
pub(crate) fn table<'a>(
    document: &'a RichDocument,
    id: &TableId,
) -> Result<&'a ElementNode, RichTableCaptionError> {
    document
        .table_path(id)
        .and_then(|path| document.document().node_at(path).ok())
        .and_then(NodeRef::as_element)
        .ok_or(RichTableCaptionError::Target)
}

impl RichDocument {
    /// Stable identity of a table's caption paragraph (candidate V4), if it has one.
    #[must_use]
    pub fn table_caption(&self, id: &TableId) -> Option<BlockId> {
        caption_id(table(self, id).ok()?)
    }

    /// The table that owns `block` when `block` is a table caption (candidate V4).
    #[must_use]
    pub fn caption_table(&self, block: &BlockId) -> Option<TableId> {
        owner_of_caption(self, block)
    }
}

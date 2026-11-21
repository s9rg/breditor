//! Explicit page breaks (`breditor/page-break`) of the rich V4.
//!
//! Breditor is a flow editor, not a pagination engine. A page break is an explicit,
//! atomic, content-free flow block that asks print and paged export to start a new
//! page after the preceding block. It carries only its stable `block-id` and is
//! admitted **only as a direct child of the document root**: list items, quotes,
//! task items, collapsible-section bodies and table cells never admit one, so every
//! forced break lies between two top-level blocks. V1–V3 never admit the kind.
use super::{BlockId, RichDocument};
use crate::document::NodeRef;

/// Page-break element kind.
pub const RICH_PAGE_BREAK_KIND: &str = "breditor/page-break";

/// Payload-free page-break admission failure.
#[derive(Clone, Copy, Debug, Eq, PartialEq, thiserror::Error)]
pub enum RichPageBreakError {
    /// The explicit rich V4 candidate profile is required; old profiles never widen.
    #[error("page breaks require the explicit rich V4 profile")]
    Profile,
    /// The target is absent or is not a page break.
    #[error("page break action requires a page break")]
    Target,
    /// Page breaks are admitted only as direct children of the document root.
    #[error("page breaks are admitted only in the document root flow")]
    Placement,
}

/// Whether `node` is a page-break element.
pub(crate) fn is_page_break(node: &NodeRef) -> bool {
    node.as_element().is_some_and(|element| element.kind().as_str() == RICH_PAGE_BREAK_KIND)
}

impl RichDocument {
    /// Whether `block` identifies a page break in this snapshot.
    #[must_use]
    pub fn is_page_break(&self, block: &BlockId) -> bool {
        self.block_path(block)
            .and_then(|path| self.document().node_at(path).ok())
            .is_some_and(is_page_break)
    }
}

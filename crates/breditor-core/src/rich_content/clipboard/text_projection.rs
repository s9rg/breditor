//! Explicit caption/code text-with-losses policy, never a retry after failed rich insertion.
use super::{RichClipboardError, RichClipboardFragment, RichClipboardKind};
use crate::{
    document::TextFragment,
    rich_content::{RichDocument, RichSelection, actions::RichGeneralRangePlan},
};
use serde::Serialize;

/// Immutable, bounded native conversion read. This report grants no mutation authority.
/// Hosts must submit its text under the same observed revision, then report its losses.
#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RichClipboardTextProjection {
    format: &'static str,
    format_version: u32,
    target: &'static str,
    text: String,
    losses: Vec<&'static str>,
}
impl RichClipboardTextProjection {
    /// Logical target selected by native general-range planning, regardless of range direction.
    #[must_use]
    pub const fn target(&self) -> &'static str {
        self.target
    }
    /// Native reading-order text, including quoted TSV for source-cell partitions.
    #[must_use]
    pub fn text(&self) -> &str {
        &self.text
    }
    /// Deterministic loss categories for the actual admitted source tree.
    #[must_use]
    pub fn losses(&self) -> &[&'static str] {
        &self.losses
    }
}
impl RichClipboardFragment {
    /// Select explicit text conversion only for rich flow/grid paste starting in code or a caption
    /// (an image caption, or a V4 table caption).
    /// Prose returns `None`, keeping its ordinary structured-paste route. Inline fragments retain
    /// their original rich-paste contract. No source IDs, geometry or asset credentials are inserted.
    /// # Errors
    /// Rejects invalid/stale/non-text targets, inline payloads, empty textual content and >64 KiB text.
    pub fn project_text_for_selection(
        &self,
        document: &RichDocument,
        selection: &RichSelection,
    ) -> Result<Option<RichClipboardTextProjection>, RichClipboardError> {
        if self.kind() == RichClipboardKind::Text {
            return Err(RichClipboardError::Kind);
        }
        let plan = RichGeneralRangePlan::capture(document, selection, &TextFragment::empty())?;
        let point = plan.insertion_end()?;
        let path = document.block_path(point.block()).ok_or(RichClipboardError::Invariant)?;
        let node = document
            .document()
            .node_at(path)
            .map_err(|_| RichClipboardError::Invariant)?
            .as_element()
            .ok_or(RichClipboardError::Invariant)?;
        let caption = path
            .parent()
            .and_then(|p| document.document().node_at(&p).ok())
            .and_then(crate::document::NodeRef::as_element)
            .is_some_and(|p| matches!(p.kind().as_str(), "breditor/image" | "breditor/table"));
        let target = if node.kind().as_str() == "breditor/code-block" {
            "code"
        } else if caption {
            "caption"
        } else {
            return Ok(None);
        };
        let text = self.plain_text()?;
        if text.is_empty() || text.len() > 64 * 1024 {
            return Err(RichClipboardError::Kind);
        }
        let mut inline = false;
        let mut table = false;
        let mut media = false;
        let mut properties = false;
        let mut stack = vec![self.document().document().root()];
        while let Some(n) = stack.pop() {
            if let Some(t) = n.as_text() {
                inline |= !t.formats().is_empty();
            }
            if let Some(e) = n.as_element() {
                table |= e.kind().as_str() == "breditor/table";
                media |= matches!(
                    e.kind().as_str(),
                    "breditor/image" | "breditor/horizontal-rule" | "breditor/page-break"
                );
                properties |= e.properties().iter().any(|(k, _)| {
                    !matches!(k.as_str(), "breditor/block-id" | "breditor/document-id")
                });
                stack.extend(e.children());
            }
        }
        let mut losses = vec!["block-structure"];
        if inline {
            losses.push("inline-formatting");
        }
        if properties {
            losses.push("block-properties");
        }
        if table {
            losses.push("table-geometry");
        }
        if media {
            losses.push("embedded-content");
        }
        Ok(Some(RichClipboardTextProjection {
            format: "breditor/rich-clipboard-text-projection",
            format_version: 1,
            target,
            text,
            losses,
        }))
    }
}

//! Proved semantic copy from text, whole nodes, sibling flows and merged grids.

use super::{RichClipboardError, RichClipboardFragment, RichClipboardKind, semantic_table};
use crate::{
    document::{NodeRef, TextFragment},
    position::TextOffset,
    rich_content::{
        BlockId, ResolvedRichSelection, RichBlockDraft, RichDocument, RichSelection,
        RichSelectionKind, RichTextPoint,
        actions::{flow_siblings, text_patch},
    },
    state::EditorContext,
};

impl RichClipboardFragment {
    /// Copy a proved selection; a collapsed text caret produces no payload.
    ///
    /// Text ranges cover one text block, direct sibling flows or sibling leading list heads.
    /// Grid copy includes every merge-closed base body and current header/width/span.
    /// Node copy retains the whole rich flow node, including captions and assets.
    ///
    /// # Errors
    /// Rejects stale selections, unsupported cross-container text ranges or active schema/limits.
    pub fn copy_selection(
        context: &EditorContext,
        document: &RichDocument,
        selection: &RichSelection,
    ) -> Result<Option<Self>, RichClipboardError> {
        let resolved = selection.resolve(document)?;
        match (selection.kind(), resolved) {
            (RichSelectionKind::TextRange { anchor, focus }, _) => {
                text(context, document, anchor, focus)
            }
            (RichSelectionKind::Node(id), _) => {
                let node = RichBlockDraft::capture(document, id)?.into_node();
                let node = semantic_table::normalize(document, &node)?;
                Ok(Some(Self::from_nodes(context, RichClipboardKind::Flow, vec![node])?))
            }
            (_, ResolvedRichSelection::Grid(grid)) => {
                let view =
                    document.table(grid.anchor().table())?.ok_or(RichClipboardError::Invariant)?;
                let node = document
                    .table_path(view.id())
                    .and_then(|path| document.document().node_at(path).ok())
                    .ok_or(RichClipboardError::Invariant)?;
                let node = semantic_table::rectangle(&view, node, grid.rows(), grid.columns())?;
                Ok(Some(Self::from_nodes(context, RichClipboardKind::Grid, vec![node])?))
            }
            _ => Err(RichClipboardError::Kind),
        }
    }
    /// Copy a direct sibling flow interval in reading order, retaining rich bodies.
    ///
    /// # Errors
    /// Rejects absent/reversed/cross-parent boundaries or active schema/resource limits.
    pub fn copy_flow(
        context: &EditorContext,
        document: &RichDocument,
        first: &BlockId,
        last: &BlockId,
    ) -> Result<Self, RichClipboardError> {
        let nodes = flow_siblings::copied(document, first, last)?
            .iter()
            .map(|node| semantic_table::normalize(document, node))
            .collect::<Result<Vec<_>, _>>()?;
        Self::from_nodes(context, RichClipboardKind::Flow, nodes)
    }
}

pub(super) fn sliced(
    node: &NodeRef,
    start: TextOffset,
    end: TextOffset,
) -> Result<TextFragment, RichClipboardError> {
    let text = text_patch::fragment(node)?;
    let (_, rest) = text.split_at(start).map_err(|_| RichClipboardError::Invariant)?;
    let length =
        TextOffset::try_new(end.get() - start.get()).map_err(|_| RichClipboardError::Invariant)?;
    Ok(rest.split_at(length).map_err(|_| RichClipboardError::Invariant)?.0)
}
fn text(
    context: &EditorContext,
    document: &RichDocument,
    anchor: &RichTextPoint,
    focus: &RichTextPoint,
) -> Result<Option<RichClipboardFragment>, RichClipboardError> {
    if anchor.block() == focus.block() {
        let node = text_patch::block_node(document, anchor.block())?;
        let fragment =
            sliced(node, anchor.offset().min(focus.offset()), anchor.offset().max(focus.offset()))?;
        if fragment.is_empty() {
            return Ok(None);
        }
        let node = RichBlockDraft::paragraph(anchor.block(), &fragment)?.into_node();
        return Ok(Some(RichClipboardFragment::from_nodes(
            context,
            RichClipboardKind::Text,
            vec![node],
        )?));
    }
    let a = document.block_path(anchor.block()).ok_or(RichClipboardError::Invariant)?.to_vec();
    let f = document.block_path(focus.block()).ok_or(RichClipboardError::Invariant)?.to_vec();
    let (start, end) = if a < f { (anchor, focus) } else { (focus, anchor) };
    let Ok(mut nodes) = flow_siblings::copied(document, start.block(), end.block()) else {
        let nodes = super::capture_list::leading_items(document, start, end)?;
        let nodes = nodes
            .iter()
            .map(|node| semantic_table::normalize(document, node))
            .collect::<Result<Vec<_>, _>>()?;
        return Ok(Some(RichClipboardFragment::from_nodes(
            context,
            RichClipboardKind::Flow,
            nodes,
        )?));
    };
    let first = nodes.first_mut().ok_or(RichClipboardError::Invariant)?;
    *first = text_patch::text_node(
        first,
        &sliced(first, start.offset(), text_patch::fragment(first)?.utf16_len())?,
    )?;
    let last = nodes.last_mut().ok_or(RichClipboardError::Invariant)?;
    *last = text_patch::text_node(last, &sliced(last, TextOffset::ZERO, end.offset())?)?;
    let nodes = nodes
        .iter()
        .map(|node| semantic_table::normalize(document, node))
        .collect::<Result<Vec<_>, _>>()?;
    Ok(Some(RichClipboardFragment::from_nodes(context, RichClipboardKind::Flow, nodes)?))
}

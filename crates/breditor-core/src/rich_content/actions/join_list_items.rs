//! Join adjacent rich items without moving a later paragraph before earlier media/nested content.

use super::{
    RichAction, RichActionError, RichEdit, SplitListItem,
    branch_patch::BranchPatch,
    list_boundary_patch::ListBoundaryPatch,
    list_helpers::{children, id, interval, list_node, with_children},
    node_patch::NodePatch,
    text_patch::{fragment, text_node},
};
use crate::{
    rich_content::{BlockId, RichDocument, rich_text_mapping::RichBoundaryMap},
    state::EditorContext,
};

/// One exact adjacent-item join; a rich left tail prevents unsafe leading-text concatenation.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct JoinListItems {
    pub(super) patch: ListBoundaryPatch,
}

impl JoinListItems {
    /// Join adjacent items, concatenating leading text only when the left has no trailing flow.
    ///
    /// Otherwise the right leading paragraph remains a later rich body block with its ID.
    /// This preserves original reading order around images, tables and nested lists.
    ///
    /// # Errors
    /// Rejects missing/reversed/nonadjacent items or inconsistent text/item shapes.
    pub fn capture(
        document: &RichDocument,
        container: &BlockId,
        left: &BlockId,
        right: &BlockId,
    ) -> Result<Self, RichActionError> {
        let source = list_node(document, container)?;
        let (first, last) = interval(source, left, right)?;
        if last != first + 1 {
            return Err(RichActionError::ListShape);
        }
        let mut items = children(source)?.to_vec();
        let left_item = &items[first];
        let right_item = &items[last];
        let left_body = children(left_item)?;
        let right_body = children(right_item)?;
        let (body, map) = if left_body.len() == 1 {
            let left_node = &left_body[0];
            let right_node = &right_body[0];
            let head = fragment(left_node)?;
            let text = head
                .try_concat(&fragment(right_node)?)
                .map_err(|_| RichActionError::TextPrimitive)?;
            let joined = text_node(left_node, &text)?;
            let mut body = vec![joined.clone()];
            body.extend_from_slice(&right_body[1..]);
            (
                body,
                Some(RichBoundaryMap {
                    left: id(left_node)?,
                    right: id(right_node)?,
                    offset: head.utf16_len(),
                    joined,
                    left_node: left_node.clone(),
                    right_node: right_node.clone(),
                    splitting: false,
                }),
            )
        } else {
            let mut body = left_body.to_vec();
            body.extend_from_slice(right_body);
            (body, None)
        };
        let joined_item = with_children(left_item, body)?;
        items.splice(first..=last, [joined_item]);
        Ok(Self {
            patch: ListBoundaryPatch {
                branch: BranchPatch::Node(NodePatch::capture(
                    document,
                    container,
                    with_children(source, items)?,
                )?),
                map,
            },
        })
    }
    pub(super) fn from_inverse(patch: ListBoundaryPatch) -> Self {
        Self { patch }
    }
    /// Publish one complete join with exact inverse restoring original items and body identities.
    ///
    /// # Errors
    /// Rejects stale lists, invalid resulting grammar or active host policy.
    pub fn apply(
        &self,
        context: &EditorContext,
        document: &RichDocument,
    ) -> Result<Option<RichEdit>, RichActionError> {
        self.patch.edit(context, document, |patch| {
            RichAction::SplitListItem(SplitListItem::from_inverse(patch))
        })
    }
}

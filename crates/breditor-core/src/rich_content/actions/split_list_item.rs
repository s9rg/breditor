//! Split an item's leading text into a new explicitly identified sibling item.

use super::{
    JoinListItems, RichAction, RichActionError, RichEdit,
    branch_patch::BranchPatch,
    list_boundary_patch::ListBoundaryPatch,
    list_helpers::{children, id, list_node, with_children},
    node_patch::NodePatch,
    text_patch::{block_node, fragment, text_node},
};
use crate::{
    document::PropertyValue,
    rich_content::{
        BlockId, RichBlockDraft, RichDocument, RichTextPoint, drafts::element,
        rich_text_mapping::RichBoundaryMap,
    },
    state::EditorContext,
};

/// One guarded list-item Enter operation; trailing flow follows the new right item.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SplitListItem {
    pub(super) patch: ListBoundaryPatch,
}

impl SplitListItem {
    /// Split a leading text block at a scalar boundary, with fresh item/text identities.
    ///
    /// The right item receives the original trailing images, nested lists and other flow.
    ///
    /// # Errors
    /// Rejects non-leading text, wrong parents, invalid boundaries or heading ranks.
    pub fn capture(
        document: &RichDocument,
        point: &RichTextPoint,
        new_item: &BlockId,
        right: &BlockId,
        right_heading: Option<u8>,
    ) -> Result<Self, RichActionError> {
        let path = document.block_path(point.block()).ok_or(RichActionError::MissingTarget)?;
        if path.last_index() != Some(0) {
            return Err(RichActionError::ListShape);
        }
        let item_path = path.parent().ok_or(RichActionError::ListShape)?;
        let list_path = item_path.parent().ok_or(RichActionError::ListShape)?;
        let item =
            document.document().node_at(&item_path).map_err(|_| RichActionError::ListShape)?;
        if item.as_element().is_none_or(|item| item.kind().as_str() != "breditor/list-item") {
            return Err(RichActionError::ListShape);
        }
        let list =
            document.document().node_at(&list_path).map_err(|_| RichActionError::ListShape)?;
        list_node(document, &id(list)?)?;
        let source = block_node(document, point.block())?;
        let (head, tail) =
            fragment(source)?.split_at(point.offset()).map_err(|_| RichActionError::TextRange)?;
        let left_node = text_node(source, &head)?;
        let right_node = if let Some(rank) = right_heading {
            RichBlockDraft::heading(right, rank, &tail)?
        } else {
            RichBlockDraft::paragraph(right, &tail)?
        }
        .into_node();
        let left_item = with_children(item, vec![left_node.clone()])?;
        let mut body = vec![right_node.clone()];
        body.extend_from_slice(&children(item)?[1..]);
        let right_item = element(
            "list-item",
            vec![("block-id", PropertyValue::from_string(new_item.as_str()))],
            body,
        )?;
        let index = usize::try_from(item_path.last_index().ok_or(RichActionError::ListShape)?)
            .map_err(|_| RichActionError::ListShape)?;
        let mut items = children(list)?.to_vec();
        items.splice(index..=index, [left_item, right_item]);
        let branch = BranchPatch::Node(NodePatch::capture(
            document,
            &id(list)?,
            with_children(list, items)?,
        )?);
        Ok(Self {
            patch: ListBoundaryPatch {
                branch,
                map: Some(RichBoundaryMap {
                    left: point.block().clone(),
                    right: right.clone(),
                    offset: point.offset(),
                    joined: source.clone(),
                    left_node,
                    right_node,
                    splitting: true,
                }),
            },
        })
    }
    pub(super) fn from_inverse(patch: ListBoundaryPatch) -> Self {
        Self { patch }
    }
    /// Publish one whole item split and exact inverse join, including tail flow.
    ///
    /// # Errors
    /// Rejects stale lists, reused IDs, ordinal overflow or active host policy.
    pub fn apply(
        &self,
        context: &EditorContext,
        document: &RichDocument,
    ) -> Result<Option<RichEdit>, RichActionError> {
        self.patch.edit(context, document, |patch| {
            RichAction::JoinListItems(JoinListItems::from_inverse(patch))
        })
    }
}

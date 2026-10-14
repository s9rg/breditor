//! Outdent rich items while preserving depth-first body order and numbered tail values.

use super::{
    IndentListItems, RichAction, RichActionError, RichEdit,
    branch_patch::BranchPatch,
    flow_siblings::FlowSiblings,
    list_helpers::{children, id, list_node, with_children},
    list_parts::ListParts,
    node_patch::NodePatch,
};
use crate::{
    document::NodeRef,
    rich_content::{BlockId, RichDocument},
    state::EditorContext,
};

/// One guarded nested promotion or top-level unlisting of a contiguous item range.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct OutdentListItems {
    patch: BranchPatch,
}

fn nested(
    document: &RichDocument,
    source: &NodeRef,
    container: &BlockId,
    mut parts: ListParts,
) -> Result<BranchPatch, RichActionError> {
    let path = document.block_path(container).ok_or(RichActionError::MissingTarget)?;
    let parent_path = path.parent().ok_or(RichActionError::ListShape)?;
    let outer_path = parent_path.parent().ok_or(RichActionError::ListShape)?;
    let outer = document.document().node_at(&outer_path).map_err(|_| RichActionError::ListShape)?;
    crate::rich_content::RichListKind::from_node(outer)?;
    let parent_index = usize::try_from(parent_path.last_index().ok_or(RichActionError::ListShape)?)
        .map_err(|_| RichActionError::ListShape)?;
    let nested_index = usize::try_from(path.last_index().ok_or(RichActionError::ListShape)?)
        .map_err(|_| RichActionError::ListShape)?;
    let mut outer_items = children(outer)?.to_vec();
    let parent = &outer_items[parent_index];
    let parent_body = children(parent)?;
    if parent_body.get(nested_index) != Some(source) {
        return Err(RichActionError::ListShape);
    }
    let mut before = parent_body[..nested_index].to_vec();
    if let Some(prefix) = parts.prefix {
        before.push(prefix);
    }
    let final_item = parts.selected.last_mut().ok_or(RichActionError::ListShape)?;
    let mut last_body = children(final_item)?.to_vec();
    if let Some(tail) = parts.tail {
        last_body.push(tail);
    }
    // Trailing flow was after the complete nested list, not before the promoted items.
    last_body.extend_from_slice(&parent_body[nested_index + 1..]);
    *final_item = with_children(final_item, last_body)?;
    outer_items[parent_index] = with_children(parent, before)?;
    let insertion = parent_index + 1;
    outer_items.splice(insertion..insertion, parts.selected);
    Ok(BranchPatch::Node(NodePatch::capture(
        document,
        &id(outer)?,
        with_children(outer, outer_items)?,
    )?))
}

impl OutdentListItems {
    /// Promote nested items, or unwrap top-level selected items into their flow parent.
    ///
    /// A prefix and suffix need two live list nodes, so supply one fresh suffix ID
    /// exactly in that case. Tail numbering retains its original ordinal.
    /// Following rich flow moves after the last promoted item to preserve reading order.
    ///
    /// # Errors
    /// Rejects invalid list/item boundaries, missing/unused tail IDs or ordinal overflow.
    pub fn capture(
        document: &RichDocument,
        container: &BlockId,
        first: &BlockId,
        last: &BlockId,
        fresh_tail: Option<&BlockId>,
    ) -> Result<Self, RichActionError> {
        let source = list_node(document, container)?;
        let parts = ListParts::capture(source, first, last, fresh_tail)?;
        let location = document.block_path(container).ok_or(RichActionError::MissingTarget)?;
        let parent = location
            .parent()
            .and_then(|path| document.document().node_at(&path).ok())
            .and_then(NodeRef::as_element)
            .ok_or(RichActionError::ListShape)?;
        let patch = if parent.kind().as_str() == "breditor/list-item" {
            nested(document, source, container, parts)?
        } else {
            let mut replacement = Vec::new();
            if let Some(prefix) = parts.prefix {
                replacement.push(prefix);
            }
            for item in parts.selected {
                replacement.extend_from_slice(children(&item)?);
            }
            if let Some(tail) = parts.tail {
                replacement.push(tail);
            }
            BranchPatch::Flow(
                FlowSiblings::capture(document, container, container)?
                    .splice(document, replacement)?,
            )
        };
        Ok(Self { patch })
    }
    pub(super) fn from_inverse(patch: BranchPatch) -> Self {
        Self { patch }
    }
    /// Publish one complete outdent/unlist and exact inverse, retaining every rich body.
    ///
    /// # Errors
    /// Rejects stale branches, duplicate IDs, invalid resulting grammar or active host policy.
    pub fn apply(
        &self,
        context: &EditorContext,
        document: &RichDocument,
    ) -> Result<Option<RichEdit>, RichActionError> {
        self.patch.edit(
            context,
            document,
            RichAction::IndentListItems(IndentListItems::from_inverse(self.patch.inverse())),
        )
    }
}

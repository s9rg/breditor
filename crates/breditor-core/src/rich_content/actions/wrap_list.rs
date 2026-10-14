//! Wrap a rich sibling range without dropping images, tables or nested trailing flow.

use super::{
    RichAction, RichActionError, RichEdit, UnwrapList, flow_patch::FlowPatch,
    flow_siblings::FlowSiblings, list_helpers::is_text,
};
use crate::{
    document::PropertyValue,
    rich_content::{BlockId, RichDocument, RichListKind, drafts::element},
    state::EditorContext,
};

/// One guarded list wrap; each selected text block starts an explicitly identified item.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct WrapList {
    patch: FlowPatch,
}

impl WrapList {
    /// Wrap an ordered sibling range beginning with text, with one item ID per text block.
    ///
    /// Non-text flow following a text block becomes that item's retained tail.
    /// No leading paragraph, item ID or media body is invented or flattened.
    ///
    /// # Errors
    /// Rejects invalid boundaries, a non-text first child, wrong item-ID cardinality or ordinals.
    pub fn capture(
        document: &RichDocument,
        first: &BlockId,
        last: &BlockId,
        container: &BlockId,
        items: &[BlockId],
        kind: RichListKind,
    ) -> Result<Self, RichActionError> {
        let siblings = FlowSiblings::capture(document, first, last)?;
        let selected = &siblings.children[siblings.first..=siblings.last];
        if !is_text(&selected[0])
            || selected.iter().filter(|node| is_text(node)).count() != items.len()
        {
            return Err(RichActionError::ListShape);
        }
        let mut groups: Vec<Vec<crate::document::NodeRef>> = Vec::new();
        for node in selected {
            if is_text(node) {
                groups.push(vec![node.clone()]);
            } else {
                groups.last_mut().ok_or(RichActionError::ListShape)?.push(node.clone());
            }
        }
        let nodes = groups
            .into_iter()
            .zip(items)
            .map(|(children, id)| {
                element(
                    "list-item",
                    vec![("block-id", PropertyValue::from_string(id.as_str()))],
                    children,
                )
            })
            .collect::<Result<_, _>>()?;
        let wrapper = kind.node(container, nodes)?;
        Ok(Self { patch: siblings.splice(document, vec![wrapper])? })
    }
    pub(super) fn from_inverse(patch: FlowPatch) -> Self {
        Self { patch }
    }
    /// Publish one exact list wrap with retained body IDs and an inverse unwrap.
    ///
    /// # Errors
    /// Rejects stale parents, duplicate IDs, invalid parent grammar or active host policy.
    pub fn apply(
        &self,
        context: &EditorContext,
        document: &RichDocument,
    ) -> Result<Option<RichEdit>, RichActionError> {
        self.patch.edit(
            context,
            document,
            RichAction::UnwrapList(UnwrapList::from_inverse(self.patch.inverse())),
        )
    }
}

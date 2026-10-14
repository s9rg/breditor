//! Insert an explicit rich flow fragment without flattening clipboard structures or media.

use super::{ReplaceBlocks, RichAction, RichActionError, RichEdit, flow_patch::FlowPatch};
use crate::{
    rich_content::{RichBlockDraft, RichDocument, RichFlowPosition},
    state::EditorContext,
};

/// One guarded rich fragment insertion in document/item/cell flow.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct InsertBlocks {
    patch: FlowPatch,
}

impl InsertBlocks {
    /// Insert ordered drafts before a stable child, or append; every new ID remains host-owned.
    ///
    /// # Errors
    /// Rejects absent/wrong-kind parents or non-child anchors. Complete admission is deferred.
    pub fn capture(
        document: &RichDocument,
        position: &RichFlowPosition,
        blocks: Vec<RichBlockDraft>,
    ) -> Result<Self, RichActionError> {
        let path = position.parent().path(document).ok_or(RichActionError::FlowParent)?;
        let parent = document
            .document()
            .node_at(&path)
            .map_err(|_| RichActionError::MissingTarget)?
            .as_element()
            .ok_or(RichActionError::FlowParent)?;
        let mut children = parent.children().to_vec();
        let insertion = position.before().map_or(Ok(children.len()), |id| {
            children
                .iter()
                .position(|node| {
                    node.as_element().and_then(|node| {
                        crate::rich_content::ast_properties::string(node, "block-id").ok()
                    }) == Some(id.as_str())
                })
                .ok_or(RichActionError::MissingTarget)
        })?;
        children.splice(insertion..insertion, blocks.into_iter().map(RichBlockDraft::into_node));
        Ok(Self { patch: FlowPatch::rewrite_children(document, position.parent(), children)? })
    }
    /// Publish the complete fragment as one edit, with exact inverse branch restoration.
    ///
    /// # Errors
    /// Rejects stale parents, duplicate IDs, unsupported grammar/formats or active host policy.
    pub fn apply(
        &self,
        context: &EditorContext,
        document: &RichDocument,
    ) -> Result<Option<RichEdit>, RichActionError> {
        self.patch.edit(
            context,
            document,
            RichAction::ReplaceBlocks(ReplaceBlocks::from_inverse(self.patch.inverse())),
        )
    }
}

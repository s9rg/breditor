//! Unlist one task container; exact Undo retains every item identity and checked bit.

use super::{
    RichAction, RichActionError, RichEdit, WrapTaskList, flow_patch::FlowPatch,
    flow_siblings::FlowSiblings, text_patch::block_node,
};
use crate::{
    rich_content::{BlockId, RichDocument},
    state::EditorContext,
};

/// Exact whole-task-list removal, preserving all ordered rich item bodies.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct UnwrapTaskList {
    patch: FlowPatch,
}
impl UnwrapTaskList {
    /// Remove one task-list layer, not every nested task list in its body.
    ///
    /// # Errors
    /// Rejects absent/non-task-list targets, wrong item kinds or invalid flow parents.
    pub fn capture(document: &RichDocument, list: &BlockId) -> Result<Self, RichActionError> {
        let node = block_node(document, list)?
            .as_element()
            .filter(|node| node.kind().as_str() == "breditor/task-list")
            .ok_or(RichActionError::TaskTarget)?;
        let mut body = vec![];
        for item in node.children() {
            let item = item
                .as_element()
                .filter(|node| node.kind().as_str() == "breditor/task-item")
                .ok_or(RichActionError::TaskTarget)?;
            body.extend_from_slice(item.children().as_slice());
        }
        Ok(Self { patch: FlowSiblings::capture(document, list, list)?.splice(document, body)? })
    }
    pub(super) fn from_inverse(patch: FlowPatch) -> Self {
        Self { patch }
    }
    /// Publish one unlist edit, with complete task metadata retained in its inverse.
    ///
    /// # Errors
    /// Rejects stale parents, invalid resulting grammar or active host limits.
    pub fn apply(
        &self,
        context: &EditorContext,
        document: &RichDocument,
    ) -> Result<Option<RichEdit>, RichActionError> {
        self.patch.edit(
            context,
            document,
            RichAction::WrapTaskList(WrapTaskList::from_inverse(self.patch.inverse())),
        )
    }
}

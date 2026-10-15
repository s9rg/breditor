//! Explicit task completion intent; the checkbox DOM is never document authority.

use super::{
    RichAction, RichActionError, RichEdit, node_patch::NodePatch,
    rewrite_properties::with_properties, text_patch::block_node,
};
use crate::{
    document::PropertyValue,
    rich_content::{BlockId, RichDocument},
    state::EditorContext,
};

/// One captured checked-state edit, retaining task identity and its complete rich body.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SetTaskChecked {
    patch: NodePatch,
}
impl SetTaskChecked {
    /// Set an explicit Boolean rather than replaying a state-dependent toggle.
    ///
    /// # Errors
    /// Rejects absent/non-task-item targets. A list-container ID is not an item ID.
    pub fn capture(
        document: &RichDocument,
        item: &BlockId,
        checked: bool,
    ) -> Result<Self, RichActionError> {
        let node = block_node(document, item)?;
        if node.as_element().is_none_or(|node| node.kind().as_str() != "breditor/task-item") {
            return Err(RichActionError::TaskTarget);
        }
        let replacement =
            with_properties(node, [("checked", Some(PropertyValue::boolean(checked)))])?;
        Ok(Self { patch: NodePatch::capture(document, item, replacement)? })
    }
    /// Publish a true no-op or one exact undoable item-state change.
    ///
    /// # Errors
    /// Rejects stale target/binding or invalid active policy before publication.
    pub fn apply(
        &self,
        context: &EditorContext,
        document: &RichDocument,
    ) -> Result<Option<RichEdit>, RichActionError> {
        self.patch.edit(
            context,
            document,
            RichAction::SetTaskChecked(Self { patch: self.patch.inverse() }),
        )
    }
}

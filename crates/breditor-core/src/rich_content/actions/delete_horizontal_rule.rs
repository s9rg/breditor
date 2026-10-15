//! Delete an exact rule without implicitly deleting or manufacturing surrounding text.

use super::{
    ReplaceBlocks, RichAction, RichActionError, RichEdit, flow_patch::FlowPatch,
    text_patch::block_node,
};
use crate::{
    rich_content::{BlockId, RichBlockDraft, RichDocument},
    state::EditorContext,
};

/// Rule deletion with an explicit optional replacement for a sole-child flow.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DeleteHorizontalRule {
    patch: FlowPatch,
}
impl DeleteHorizontalRule {
    /// Remove one rule; hosts supply a fresh replacement if its container would become empty.
    ///
    /// # Errors
    /// Rejects wrong-kind targets, invalid flow scope or an empty resulting container.
    pub fn capture(
        document: &RichDocument,
        block: &BlockId,
        replacement: Option<RichBlockDraft>,
    ) -> Result<Self, RichActionError> {
        if block_node(document, block)?
            .as_element()
            .is_none_or(|node| node.kind().as_str() != "breditor/horizontal-rule")
        {
            return Err(RichActionError::RuleTarget);
        }
        Ok(Self { patch: FlowPatch::remove(document, block, replacement)? })
    }
    /// Publish one exact deletion and retain its source node in the local inverse.
    ///
    /// # Errors
    /// Rejects stale parents, invalid replacement grammar/identity or active host limits.
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

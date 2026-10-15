//! Insert one stable atomic separator, with no implicit surrounding paragraph allocation.

use super::{ReplaceBlocks, RichAction, RichActionError, RichEdit, flow_patch::FlowPatch};
use crate::{
    rich_content::{BlockId, RichBlockDraft, RichDocument, RichFlowPosition},
    state::EditorContext,
};

/// Exact rule insertion in one explicit rich flow position.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct InsertHorizontalRule {
    patch: FlowPatch,
}
impl InsertHorizontalRule {
    /// Insert a rule with a host-owned fresh ID; navigation text is a separate explicit action.
    ///
    /// # Errors
    /// Rejects an absent/wrong parent or sibling anchor; V2/identity proof runs on apply.
    pub fn capture(
        document: &RichDocument,
        position: &RichFlowPosition,
        id: &BlockId,
    ) -> Result<Self, RichActionError> {
        Ok(Self {
            patch: FlowPatch::insert(
                document,
                position,
                RichBlockDraft::horizontal_rule(id)?.into_node(),
            )?,
        })
    }
    /// Publish one insertion with exact branch restoration for local Undo.
    ///
    /// # Errors
    /// Rejects stale parents, duplicate IDs, V1/invalid grammar or active limits.
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

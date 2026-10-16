//! Whole-root flow replacement under an exact source guard; never a shared JSON-register write.
use super::{RichAction, RichActionError, RichEdit, flow_patch::FlowPatch};
use crate::{
    rich_content::{RichBlockDraft, RichDocument, RichFlowParent},
    state::EditorContext,
};
/// Replace all current root blocks, including hidden tables and leading/trailing atoms.
/// Shared adapters must lower this intent into captured owned deletions and fresh insertions.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ReplaceDocument {
    patch: FlowPatch,
}
impl ReplaceDocument {
    /// Capture an explicit nonempty root flow. New IDs require normal final document admission.
    /// # Errors
    /// Rejects an empty replacement or a contradicted source proof.
    pub fn capture(
        document: &RichDocument,
        replacement: Vec<RichBlockDraft>,
    ) -> Result<Self, RichActionError> {
        if replacement.is_empty() {
            return Err(RichActionError::FlowWouldBeEmpty);
        }
        Ok(Self {
            patch: FlowPatch::rewrite_children(
                document,
                &RichFlowParent::Document,
                replacement.into_iter().map(RichBlockDraft::into_node).collect(),
            )?,
        })
    }
    /// Apply the exact whole-root flow change, retaining every removed body/atom in its inverse.
    /// # Errors
    /// Rejects stale sources, duplicate IDs, grammar/format or active resource-policy failures.
    pub fn apply(
        &self,
        context: &EditorContext,
        document: &RichDocument,
    ) -> Result<Option<RichEdit>, RichActionError> {
        self.patch.edit(
            context,
            document,
            RichAction::ReplaceDocument(Self { patch: self.patch.inverse() }),
        )
    }
}

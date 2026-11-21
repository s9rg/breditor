//! Guarded V4 section open/collapse change; summary, body and identities are untouched.
use super::{
    RichAction, RichActionError, RichEdit, node_patch::NodePatch,
    rewrite_properties::with_properties,
};
use crate::{
    rich_content::{BlockId, RichDetailsError, RichDocument, details},
    state::EditorContext,
};

/// Exact open-state patch of one section, with a full-source guard and inverse.
///
/// Open state is persisted document state (HTML's `open` attribute): it is part of
/// history, checkpoints and clipboard records, never a renderer-only view flag.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SetDetailsOpen {
    patch: NodePatch,
}

impl SetDetailsOpen {
    /// Capture one explicit open (`true`) or collapsed (`false`) intent.
    /// # Errors
    /// Rejects an absent or non-section target. Rich V4 proof runs on apply.
    pub fn capture(
        document: &RichDocument,
        block: &BlockId,
        open: bool,
    ) -> Result<Self, RichActionError> {
        let path = document.block_path(block).ok_or(RichActionError::MissingTarget)?;
        let node = document.document().node_at(path).map_err(|_| RichActionError::MissingTarget)?;
        details::section(document, block)?;
        let replacement = with_properties(node, details::open_properties(open))?;
        Ok(Self { patch: NodePatch::capture(document, block, replacement)? })
    }
    /// Publish one state change or an exact no-op; original profiles never widen.
    /// # Errors
    /// Rejects non-V4 context, stale source and complete-tree resource/policy failures.
    pub fn apply(
        &self,
        context: &EditorContext,
        document: &RichDocument,
    ) -> Result<Option<RichEdit>, RichActionError> {
        if !context.schema().supports_rich_details() {
            return Err(RichDetailsError::Profile.into());
        }
        self.patch.edit(
            context,
            document,
            RichAction::SetDetailsOpen(Self { patch: self.patch.inverse() }),
        )
    }
}

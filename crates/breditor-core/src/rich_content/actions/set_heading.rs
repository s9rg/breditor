//! Convert one stable rich text block between paragraph and ranked heading.

use super::{
    RichAction, RichActionError, RichEdit,
    node_patch::NodePatch,
    text_patch::{block_node, fragment},
};
use crate::{
    rich_content::{BlockId, RichBlockDraft, RichDocument},
    state::EditorContext,
};

/// Exact local text-block kind/rank change, retaining ID, Unicode text and formats.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SetHeading {
    patch: NodePatch,
}

impl SetHeading {
    /// Select heading rank 1–6, or paragraph with `None`, without changing text identity.
    ///
    /// # Errors
    /// Rejects absent/non-text targets or invalid ranks. Parent grammar, including
    /// paragraph-only image captions, is admitted when the action is applied.
    pub fn capture(
        document: &RichDocument,
        block: &BlockId,
        level: Option<u8>,
    ) -> Result<Self, RichActionError> {
        let text = fragment(block_node(document, block)?)?;
        let draft = if let Some(level) = level {
            RichBlockDraft::heading(block, level, &text)?
        } else {
            RichBlockDraft::paragraph(block, &text)?
        };
        Ok(Self { patch: NodePatch::capture(document, block, draft.into_node())? })
    }
    /// Publish one exact undoable rank/kind change, keeping stable text/node selections.
    ///
    /// # Errors
    /// Rejects stale blocks, invalid parent grammar or active host policy.
    pub fn apply(
        &self,
        context: &EditorContext,
        document: &RichDocument,
    ) -> Result<Option<RichEdit>, RichActionError> {
        self.patch.edit(
            context,
            document,
            RichAction::SetHeading(Self { patch: self.patch.inverse() }),
        )
    }
}

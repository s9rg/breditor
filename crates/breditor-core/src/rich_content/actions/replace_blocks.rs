//! Replace an ordered rich sibling range while retaining exact restoration for removed media/bodies.

use super::{
    RichAction, RichActionError, RichEdit, flow_patch::FlowPatch, flow_siblings::FlowSiblings,
};
use crate::{
    rich_content::{BlockId, RichBlockDraft, RichDocument},
    state::EditorContext,
};

/// One exact rich-flow replacement/removal, suitable for structured clipboard planners.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ReplaceBlocks {
    patch: FlowPatch,
}

impl ReplaceBlocks {
    /// Replace a complete ordered sibling range with explicit rich drafts, including an empty removal.
    ///
    /// # Errors
    /// Rejects invalid boundaries, wrong flow parents or an empty resulting container.
    pub fn capture(
        document: &RichDocument,
        first: &BlockId,
        last: &BlockId,
        replacement: Vec<RichBlockDraft>,
    ) -> Result<Self, RichActionError> {
        Ok(Self {
            patch: FlowSiblings::capture(document, first, last)?.splice(
                document,
                replacement.into_iter().map(RichBlockDraft::into_node).collect(),
            )?,
        })
    }
    pub(super) fn from_inverse(patch: FlowPatch) -> Self {
        Self { patch }
    }
    /// Publish complete replacement and exact local inverse; no HTML/asset I/O occurs here.
    ///
    /// # Errors
    /// Rejects stale parents, duplicate IDs, invalid rich grammar/formats or active host policy.
    pub fn apply(
        &self,
        context: &EditorContext,
        document: &RichDocument,
    ) -> Result<Option<RichEdit>, RichActionError> {
        self.patch.edit(
            context,
            document,
            RichAction::ReplaceBlocks(Self { patch: self.patch.inverse() }),
        )
    }
}

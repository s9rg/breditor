//! Insert an asset-bound image and optional caption as one local flow edit, without I/O.

use super::{DeleteImage, RichAction, RichActionError, RichEdit, flow_patch::FlowPatch};
use crate::{
    rich_content::{ImageDraft, RichDocument, RichFlowPosition},
    state::EditorContext,
};

/// Whole-image insertion with explicit node, asset/generation and caption identities.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct InsertImage {
    patch: FlowPatch,
}

impl InsertImage {
    /// Capture an image insertion before a stable direct-child anchor, or append.
    ///
    /// # Errors
    /// Rejects absent/wrong-kind parents and non-child anchors. Complete admission is deferred.
    pub fn capture(
        document: &RichDocument,
        position: &RichFlowPosition,
        draft: ImageDraft,
    ) -> Result<Self, RichActionError> {
        Ok(Self { patch: FlowPatch::insert(document, position, draft.into_node())? })
    }
    pub(super) fn from_inverse(patch: FlowPatch) -> Self {
        Self { patch }
    }

    /// Publish image and caption together; host asset resolution is independent.
    ///
    /// # Errors
    /// Rejects stale parents, duplicate IDs, invalid rich grammar or active host policy.
    pub fn apply(
        &self,
        context: &EditorContext,
        document: &RichDocument,
    ) -> Result<Option<RichEdit>, RichActionError> {
        self.patch.edit(
            context,
            document,
            RichAction::DeleteImage(DeleteImage::from_inverse(self.patch.inverse())),
        )
    }
}

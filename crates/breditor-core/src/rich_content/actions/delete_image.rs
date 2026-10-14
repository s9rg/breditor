//! Delete an image flow node while retaining caption and binding for exact local undo.

use super::{InsertImage, RichAction, RichActionError, RichEdit, flow_patch::FlowPatch};
use crate::{
    rich_content::{BlockId, ImageId, RichBlockDraft, RichDocument, ast_properties},
    state::EditorContext,
};

/// Whole-image removal or explicit replacement, never an asset-store deletion.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DeleteImage {
    patch: FlowPatch,
}

impl DeleteImage {
    /// Remove an image, optionally replacing its flow slot with an explicit draft.
    ///
    /// A sole child requires a replacement. Deletion neither cancels shared asset
    /// ownership nor allows a late upload completion to recreate this image.
    ///
    /// # Errors
    /// Rejects absent images, unsupported parents or an empty resulting flow container.
    pub fn capture(
        document: &RichDocument,
        image: &ImageId,
        replacement: Option<RichBlockDraft>,
    ) -> Result<Self, RichActionError> {
        let node = document
            .image_path(image)
            .and_then(|path| document.document().node_at(path).ok())
            .and_then(crate::document::NodeRef::as_element)
            .ok_or(RichActionError::MissingTarget)?;
        let block = BlockId::try_new(
            ast_properties::string(node, "block-id").map_err(|_| RichActionError::Rewrite)?,
        )
        .map_err(|_| RichActionError::Rewrite)?;
        Ok(Self { patch: FlowPatch::remove(document, &block, replacement)? })
    }
    pub(super) fn from_inverse(patch: FlowPatch) -> Self {
        Self { patch }
    }

    /// Publish removal and its guarded restoration; host asset bytes remain untouched.
    ///
    /// # Errors
    /// Rejects stale parents or schema/resource failure in the complete resulting tree.
    pub fn apply(
        &self,
        context: &EditorContext,
        document: &RichDocument,
    ) -> Result<Option<RichEdit>, RichActionError> {
        self.patch.edit(
            context,
            document,
            RichAction::InsertImage(InsertImage::from_inverse(self.patch.inverse())),
        )
    }
}

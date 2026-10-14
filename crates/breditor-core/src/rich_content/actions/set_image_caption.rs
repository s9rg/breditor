//! Add, replace or remove a paragraph caption without changing an image's asset binding.

use super::{RichAction, RichActionError, RichEdit, node_patch::NodePatch};
use crate::{
    document::NodeRef,
    rich_content::{
        BlockId, ImageId, RichBlockDraft, RichDocument, RichDraftError, ast_properties,
    },
    state::EditorContext,
};

/// Exact guarded whole-caption change; ordinary caption typing uses text actions.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SetImageCaption {
    patch: NodePatch,
}

impl SetImageCaption {
    /// Capture one optional paragraph draft, retaining its explicit identity/formats.
    ///
    /// Use a fresh block identity when replacing the entire caption. Reusing the same
    /// block with changed text requires a text-operation map for existing selections.
    ///
    /// # Errors
    /// Rejects absent images, non-paragraph captions or private AST invariants.
    pub fn capture(
        document: &RichDocument,
        image: &ImageId,
        caption: Option<RichBlockDraft>,
    ) -> Result<Self, RichActionError> {
        if caption.as_ref().is_some_and(|draft| {
            draft
                .node()
                .as_element()
                .is_none_or(|node| node.kind().as_str() != "breditor/paragraph")
        }) {
            return Err(RichDraftError::Caption.into());
        }
        let node = document
            .image_path(image)
            .and_then(|path| document.document().node_at(path).ok())
            .and_then(NodeRef::as_element)
            .ok_or(RichActionError::MissingTarget)?;
        let block = BlockId::try_new(
            ast_properties::string(node, "block-id").map_err(|_| RichActionError::Rewrite)?,
        )
        .map_err(|_| RichActionError::Rewrite)?;
        let replacement = NodeRef::element(
            node.try_with_children(caption.into_iter().map(RichBlockDraft::into_node).collect())
                .map_err(|_| RichActionError::Rewrite)?,
        );
        Ok(Self { patch: NodePatch::capture(document, &block, replacement)? })
    }

    /// Publish the complete caption edit and exact inverse; unchanged caption is a no-op.
    ///
    /// # Errors
    /// Rejects stale image subtrees, invalid caption formats/IDs or active host policy.
    pub fn apply(
        &self,
        context: &EditorContext,
        document: &RichDocument,
    ) -> Result<Option<RichEdit>, RichActionError> {
        self.patch.edit(
            context,
            document,
            RichAction::SetImageCaption(Self { patch: self.patch.inverse() }),
        )
    }
}

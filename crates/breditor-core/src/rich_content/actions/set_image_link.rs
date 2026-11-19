//! Guarded candidate-V4 image link change; asset, alt, size, caption and identities are untouched.
use super::{
    RichAction, RichActionError, RichEdit, node_patch::NodePatch,
    rewrite_properties::with_properties,
};
use crate::{
    rich_content::{
        BlockId, ImageId, RichDocument, RichImageLink, RichImageLinkError, ast_properties,
    },
    state::EditorContext,
};

/// Exact local link set/replace/clear on one image, with a full-source guard and inverse.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SetImageLink {
    patch: NodePatch,
}

impl SetImageLink {
    /// Capture one complete link intent (`None` removes the link) for one admitted image.
    /// # Errors
    /// Rejects an absent image and a link on a decorative image (it has no accessible
    /// name). Rich V4 proof and active limits are checked on apply.
    pub fn capture(
        document: &RichDocument,
        image: &ImageId,
        link: Option<&RichImageLink>,
    ) -> Result<Self, RichActionError> {
        let path = document.image_path(image).ok_or(RichActionError::MissingTarget)?;
        let node = document.document().node_at(path).map_err(|_| RichActionError::MissingTarget)?;
        let element = node.as_element().ok_or(RichImageLinkError::Target)?;
        if link.is_some()
            && document.image(image)?.is_some_and(|binding| binding.alt().is_decorative())
        {
            return Err(RichImageLinkError::Decorative.into());
        }
        let block = BlockId::try_new(
            ast_properties::string(element, "block-id").map_err(|_| RichImageLinkError::Target)?,
        )
        .map_err(|_| RichImageLinkError::Target)?;
        let replacement = with_properties(node, RichImageLink::properties(link))?;
        Ok(Self { patch: NodePatch::capture(document, &block, replacement)? })
    }
    /// Publish one link edit or an exact no-op; original profiles never widen.
    /// # Errors
    /// Rejects non-V4 context, stale source/binding and complete-tree resource/policy failures.
    pub fn apply(
        &self,
        context: &EditorContext,
        document: &RichDocument,
    ) -> Result<Option<RichEdit>, RichActionError> {
        if !context.schema().supports_rich_image_links() {
            return Err(RichImageLinkError::Profile.into());
        }
        self.patch.edit(
            context,
            document,
            RichAction::SetImageLink(Self { patch: self.patch.inverse() }),
        )
    }
}

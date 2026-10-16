//! Guarded bounded metadata change, never a text replacement or browser style mutation.
use super::{
    RichAction, RichActionError, RichEdit, node_patch::NodePatch,
    rewrite_properties::with_properties, text_patch::block_node,
};
use crate::{
    rich_content::{
        BlockId, RichBlockLayout, RichBlockLayoutError, RichBlockLayoutPatch, RichDocument,
    },
    state::EditorContext,
};

/// Exact local layout patch with a full-source guard and inverse metadata.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SetBlockLayout {
    patch: NodePatch,
}
impl SetBlockLayout {
    /// Capture only named field changes on an admitted paragraph, heading or code block.
    /// # Errors
    /// Rejects absent/non-text targets. Rich V3 proof and active limits are checked on apply.
    pub fn capture(
        document: &RichDocument,
        block: &BlockId,
        change: &RichBlockLayoutPatch,
    ) -> Result<Self, RichActionError> {
        let node = block_node(document, block)?;
        RichBlockLayout::from_node(node.as_element().ok_or(RichBlockLayoutError::Target)?)?;
        let replacement = with_properties(node, change.properties())?;
        Ok(Self { patch: NodePatch::capture(document, block, replacement)? })
    }
    /// Publish one metadata edit or exact no-op; never widen original profiles.
    /// # Errors
    /// Rejects non-V3 context, stale source/binding and complete-tree resource/policy failures.
    pub fn apply(
        &self,
        context: &EditorContext,
        document: &RichDocument,
    ) -> Result<Option<RichEdit>, RichActionError> {
        if context.schema().rich_content_revision() != Some(3) {
            return Err(RichBlockLayoutError::Profile.into());
        }
        self.patch.edit(
            context,
            document,
            RichAction::SetBlockLayout(Self { patch: self.patch.inverse() }),
        )
    }
}

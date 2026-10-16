//! Explicit bounded metadata on insertion drafts; complete V3 admission remains mandatory.
use super::{RichBlockDraft, RichBlockLayout, RichBlockLayoutPatch, RichDraftError};
impl RichBlockDraft {
    /// Add only the supplied layout fields to one text-block insertion draft.
    ///
    /// This is not an admitted node or an implicit migration. Inserting this
    /// draft into an old profile still rejects when it contains layout metadata.
    /// # Errors
    /// Rejects a non-text flow block or an internal draft rewrite invariant.
    pub fn with_block_layout(self, patch: &RichBlockLayoutPatch) -> Result<Self, RichDraftError> {
        let node = self.into_node();
        RichBlockLayout::from_node(node.as_element().ok_or(RichDraftError::FlowBlock)?)
            .map_err(|_| RichDraftError::FlowBlock)?;
        let node = super::actions::rewrite_properties::with_properties(&node, patch.properties())
            .map_err(|_| RichDraftError::Invariant)?;
        Ok(Self::from_node(node))
    }
}

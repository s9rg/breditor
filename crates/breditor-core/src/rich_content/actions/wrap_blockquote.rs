//! Wrap whole rich siblings without flattening any text, list, table or media subtree.

use super::{
    RichAction, RichActionError, RichEdit, UnwrapBlockquote, flow_patch::FlowPatch,
    flow_siblings::FlowSiblings,
};
use crate::{
    document::PropertyValue,
    rich_content::{BlockId, RichDocument, drafts::element},
    state::EditorContext,
};

/// One guarded nonempty V2 blockquote wrapper with a host-provided fresh identity.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct WrapBlockquote {
    patch: FlowPatch,
}
impl WrapBlockquote {
    /// Wrap an ordered direct-sibling range, retaining all existing subtree identities.
    ///
    /// # Errors
    /// Rejects absent, reversed or cross-parent boundaries; final grammar/ID checks run on apply.
    pub fn capture(
        document: &RichDocument,
        first: &BlockId,
        last: &BlockId,
        wrapper: &BlockId,
    ) -> Result<Self, RichActionError> {
        let siblings = FlowSiblings::capture(document, first, last)?;
        let node = element(
            "blockquote",
            vec![("block-id", PropertyValue::from_string(wrapper.as_str()))],
            siblings.children[siblings.first..=siblings.last].to_vec(),
        )?;
        Ok(Self { patch: siblings.splice(document, vec![node])? })
    }
    pub(super) fn from_inverse(patch: FlowPatch) -> Self {
        Self { patch }
    }
    /// Publish one wrapper with an exact inverse that retains nested structures.
    ///
    /// # Errors
    /// Rejects stale parents, duplicate identities, invalid V2 grammar or host limits.
    pub fn apply(
        &self,
        context: &EditorContext,
        document: &RichDocument,
    ) -> Result<Option<RichEdit>, RichActionError> {
        self.patch.edit(
            context,
            document,
            RichAction::UnwrapBlockquote(UnwrapBlockquote::from_inverse(self.patch.inverse())),
        )
    }
}

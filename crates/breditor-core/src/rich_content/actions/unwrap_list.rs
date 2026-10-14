//! Remove one list layer while preserving each item's full rich body and nested flow.

use super::{
    RichAction, RichActionError, RichEdit, WrapList,
    flow_patch::FlowPatch,
    flow_siblings::FlowSiblings,
    list_helpers::{children, list_node},
};
use crate::{
    rich_content::{BlockId, RichDocument},
    state::EditorContext,
};

/// One exact guarded list unwrap; nested lists remain distinct rich flow blocks.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct UnwrapList {
    patch: FlowPatch,
}

impl UnwrapList {
    /// Unwrap one whole list in document/item/cell flow, retaining all body identities.
    ///
    /// # Errors
    /// Rejects absent/wrong-kind lists or invalid flow parents.
    pub fn capture(document: &RichDocument, list: &BlockId) -> Result<Self, RichActionError> {
        let node = list_node(document, list)?;
        let body = children(node)?
            .iter()
            .map(|item| children(item).map(<[_]>::to_vec))
            .collect::<Result<Vec<_>, _>>()?
            .into_iter()
            .flatten()
            .collect();
        Ok(Self { patch: FlowSiblings::capture(document, list, list)?.splice(document, body)? })
    }
    pub(super) fn from_inverse(patch: FlowPatch) -> Self {
        Self { patch }
    }
    /// Publish one layer removal with exact inverse wrapper/item identities.
    ///
    /// # Errors
    /// Rejects stale parents, invalid resulting grammar or active host policy.
    pub fn apply(
        &self,
        context: &EditorContext,
        document: &RichDocument,
    ) -> Result<Option<RichEdit>, RichActionError> {
        self.patch.edit(
            context,
            document,
            RichAction::WrapList(WrapList::from_inverse(self.patch.inverse())),
        )
    }
}

//! Change one rich list's bullet/numbered presentation while retaining every item/body ID.

use super::{
    RichAction, RichActionError, RichEdit,
    list_helpers::{children, list_node},
    node_patch::NodePatch,
};
use crate::{
    rich_content::{BlockId, RichDocument, RichListKind},
    state::EditorContext,
};

/// One exact guarded list-kind/start change; no text block or nested list is re-created.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SetListKind {
    patch: NodePatch,
}

impl SetListKind {
    /// Select explicit checked bullet/numbered style and prove every resulting ordinal.
    ///
    /// # Errors
    /// Rejects absent/non-list nodes or numbered ordinal overflow.
    pub fn capture(
        document: &RichDocument,
        list: &BlockId,
        kind: RichListKind,
    ) -> Result<Self, RichActionError> {
        let node = list_node(document, list)?;
        Ok(Self {
            patch: NodePatch::capture(document, list, kind.node(list, children(node)?.to_vec())?)?,
        })
    }
    /// Publish one style change; unchanged style/start is an admitted no-op.
    ///
    /// # Errors
    /// Rejects stale lists, invalid resulting grammar or active host policy.
    pub fn apply(
        &self,
        context: &EditorContext,
        document: &RichDocument,
    ) -> Result<Option<RichEdit>, RichActionError> {
        self.patch.edit(
            context,
            document,
            RichAction::SetListKind(Self { patch: self.patch.inverse() }),
        )
    }
}

//! Remove one explicit quote wrapper while retaining its full ordered flow body.

use super::{
    RichAction, RichActionError, RichEdit, WrapBlockquote, flow_patch::FlowPatch,
    flow_siblings::FlowSiblings, text_patch::block_node,
};
use crate::{
    rich_content::{BlockId, RichDocument},
    state::EditorContext,
};

/// One exact V2 quote unwrap; nested quotes remain separate nodes.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct UnwrapBlockquote {
    patch: FlowPatch,
}
impl UnwrapBlockquote {
    /// Replace one quote with its children; no body content or identity is fabricated.
    ///
    /// # Errors
    /// Rejects absent/non-quote targets or invalid flow parents.
    pub fn capture(document: &RichDocument, wrapper: &BlockId) -> Result<Self, RichActionError> {
        let node = block_node(document, wrapper)?
            .as_element()
            .filter(|node| node.kind().as_str() == "breditor/blockquote")
            .ok_or(RichActionError::QuoteTarget)?;
        Ok(Self {
            patch: FlowSiblings::capture(document, wrapper, wrapper)?
                .splice(document, node.children().to_vec())?,
        })
    }
    pub(super) fn from_inverse(patch: FlowPatch) -> Self {
        Self { patch }
    }
    /// Publish one layer removal with the exact original wrapper available to Undo.
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
            RichAction::WrapBlockquote(WrapBlockquote::from_inverse(self.patch.inverse())),
        )
    }
}

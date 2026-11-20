//! Remove one collapsible section, keeping its summary text as a paragraph and its whole body.

use super::{
    RichAction, RichActionError, RichEdit, WrapDetails, flow_patch::FlowPatch,
    flow_siblings::FlowSiblings,
};
use crate::{
    document::NodeRef,
    rich_content::{BlockId, RichDetailsError, RichDocument, details},
    state::EditorContext,
};

/// One exact section unwrap; nested sections remain separate nodes.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct UnwrapDetails {
    patch: FlowPatch,
}
impl UnwrapDetails {
    /// Replace one section with a paragraph carrying the summary's identity, runs and
    /// formats, followed by every body block. No identity is fabricated.
    ///
    /// # Errors
    /// Rejects absent or non-section targets and invalid flow parents.
    pub fn capture(document: &RichDocument, wrapper: &BlockId) -> Result<Self, RichActionError> {
        let node = details::section(document, wrapper)?;
        let mut children = node.children().iter();
        let summary = children
            .next()
            .filter(|node| details::is_summary_node(node))
            .ok_or(RichDetailsError::Shape)?;
        let lifted = std::iter::once(details::summary_as_paragraph(summary)?)
            .chain(children.cloned())
            .collect::<Vec<NodeRef>>();
        Ok(Self {
            patch: FlowSiblings::capture(document, wrapper, wrapper)?.splice(document, lifted)?,
        })
    }
    pub(super) fn from_inverse(patch: FlowPatch) -> Self {
        Self { patch }
    }
    /// Publish one layer removal with the exact original section available to Undo.
    ///
    /// # Errors
    /// Rejects non-V4 contexts, stale parents, invalid resulting grammar or host policy.
    pub fn apply(
        &self,
        context: &EditorContext,
        document: &RichDocument,
    ) -> Result<Option<RichEdit>, RichActionError> {
        if !context.schema().supports_rich_details() {
            return Err(RichDetailsError::Profile.into());
        }
        self.patch.edit(
            context,
            document,
            RichAction::WrapDetails(WrapDetails::from_inverse(self.patch.inverse())),
        )
    }
}

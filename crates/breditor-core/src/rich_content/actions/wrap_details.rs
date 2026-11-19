//! Wrap whole rich siblings in one candidate-V4 collapsible section with an empty summary.

use super::{
    RichAction, RichActionError, RichEdit, UnwrapDetails, flow_patch::FlowPatch,
    flow_siblings::FlowSiblings,
};
use crate::{
    document::PropertyValue,
    rich_content::{BlockId, RichDetailsError, RichDocument, details, drafts::element},
    state::EditorContext,
};

/// One guarded section wrapper with host-provided fresh section and summary identities.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct WrapDetails {
    patch: FlowPatch,
}
impl WrapDetails {
    /// Wrap an ordered direct-sibling range as the body of a new section whose summary
    /// is empty. Every wrapped subtree keeps its identity, formats and structure.
    ///
    /// # Errors
    /// Rejects absent, reversed or cross-parent boundaries and a range containing a
    /// summary. The final grammar, nesting bound and identity checks run on apply.
    pub fn capture(
        document: &RichDocument,
        first: &BlockId,
        last: &BlockId,
        wrapper: &BlockId,
        summary: &BlockId,
        open: bool,
    ) -> Result<Self, RichActionError> {
        let siblings = FlowSiblings::capture(document, first, last)?;
        let body = &siblings.children[siblings.first..=siblings.last];
        if body.iter().any(details::is_summary_node) {
            return Err(RichDetailsError::Target.into());
        }
        let mut properties = vec![("block-id", PropertyValue::from_string(wrapper.as_str()))];
        if open {
            properties.push((details::OPEN, PropertyValue::boolean(true)));
        }
        let summary = element(
            "details-summary",
            vec![("block-id", PropertyValue::from_string(summary.as_str()))],
            vec![],
        )?;
        let children = std::iter::once(summary).chain(body.iter().cloned()).collect();
        let node = element("details", properties, children)?;
        Ok(Self { patch: siblings.splice(document, vec![node])? })
    }
    pub(super) fn from_inverse(patch: FlowPatch) -> Self {
        Self { patch }
    }
    /// Publish one wrapper with an exact inverse that restores the unwrapped siblings.
    ///
    /// # Errors
    /// Rejects non-V4 contexts, stale parents, duplicate identities, invalid grammar,
    /// the nesting bound or host limits.
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
            RichAction::UnwrapDetails(UnwrapDetails::from_inverse(self.patch.inverse())),
        )
    }
}

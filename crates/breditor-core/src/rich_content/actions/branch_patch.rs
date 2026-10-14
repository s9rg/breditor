//! Local guarded branch rewrite shared by rich flow/list boundary operations.

use super::{RichAction, RichActionError, RichEdit, flow_patch::FlowPatch, node_patch::NodePatch};
use crate::{rich_content::RichDocument, state::EditorContext};

#[derive(Clone, Debug, Eq, PartialEq)]
pub(super) enum BranchPatch {
    Flow(FlowPatch),
    Node(NodePatch),
}

impl BranchPatch {
    pub(super) fn inverse(&self) -> Self {
        match self {
            Self::Flow(patch) => Self::Flow(patch.inverse()),
            Self::Node(patch) => Self::Node(patch.inverse()),
        }
    }
    pub(super) fn edit(
        &self,
        context: &EditorContext,
        document: &RichDocument,
        inverse: RichAction,
    ) -> Result<Option<RichEdit>, RichActionError> {
        match self {
            Self::Flow(patch) => patch.edit(context, document, inverse),
            Self::Node(patch) => patch.edit(context, document, inverse),
        }
    }
}

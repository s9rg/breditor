//! Insert one whole explicitly drafted table as one guarded local flow edit.

use super::{DeleteTable, RichAction, RichActionError, RichEdit, flow_patch::FlowPatch};
use crate::{
    rich_content::{RichDocument, RichFlowPosition, TableDraft},
    state::EditorContext,
};

/// Captured whole-table insertion with stable parent/sibling anchors and exact inverse.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct InsertTable {
    patch: FlowPatch,
}

impl InsertTable {
    /// Insert an explicit rectangular table before a stable flow child, or append.
    ///
    /// # Errors
    /// Rejects absent/wrong-kind parents or non-child anchors. Full schema, nested-table,
    /// identity and active host-resource checks run when the action is applied.
    pub fn capture(
        document: &RichDocument,
        position: &RichFlowPosition,
        draft: TableDraft,
    ) -> Result<Self, RichActionError> {
        Ok(Self { patch: FlowPatch::insert(document, position, draft.into_node())? })
    }
    pub(super) fn from_inverse(patch: FlowPatch) -> Self {
        Self { patch }
    }

    /// Publish the complete table, never partially inserted rows/cells.
    ///
    /// # Errors
    /// Rejects stale parents, duplicate IDs, invalid nested tables or active host policy.
    pub fn apply(
        &self,
        context: &EditorContext,
        document: &RichDocument,
    ) -> Result<Option<RichEdit>, RichActionError> {
        self.patch.edit(
            context,
            document,
            RichAction::DeleteTable(DeleteTable::from_inverse(self.patch.inverse())),
        )
    }
}

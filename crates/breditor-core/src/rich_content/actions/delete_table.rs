//! Remove a whole table, retaining every base body and merge record for exact local undo.

use super::{InsertTable, RichAction, RichActionError, RichEdit, flow_patch::FlowPatch};
use crate::{
    rich_content::{BlockId, RichBlockDraft, RichDocument, TableId, ast_properties},
    state::EditorContext,
};

/// Whole-table deletion or explicit flow replacement; no anonymous fallback is fabricated.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DeleteTable {
    patch: FlowPatch,
}

impl DeleteTable {
    /// Remove a stable table, optionally replacing its slot with an explicit flow draft.
    ///
    /// A sole flow child requires a replacement so the document/cell remains valid.
    ///
    /// # Errors
    /// Rejects missing tables, unsupported parents or an empty resulting flow container.
    pub fn capture(
        document: &RichDocument,
        table: &TableId,
        replacement: Option<RichBlockDraft>,
    ) -> Result<Self, RichActionError> {
        let node = document
            .table_path(table)
            .and_then(|path| document.document().node_at(path).ok())
            .and_then(crate::document::NodeRef::as_element)
            .ok_or(RichActionError::MissingTarget)?;
        let block = BlockId::try_new(
            ast_properties::string(node, "block-id").map_err(|_| RichActionError::Rewrite)?,
        )
        .map_err(|_| RichActionError::Rewrite)?;
        Ok(Self { patch: FlowPatch::remove(document, &block, replacement)? })
    }
    pub(super) fn from_inverse(patch: FlowPatch) -> Self {
        Self { patch }
    }

    /// Publish the whole removal with an exact inverse retaining original identities.
    ///
    /// # Errors
    /// Rejects stale parents or schema/resource failure in the complete resulting tree.
    pub fn apply(
        &self,
        context: &EditorContext,
        document: &RichDocument,
    ) -> Result<Option<RichEdit>, RichActionError> {
        self.patch.edit(
            context,
            document,
            RichAction::InsertTable(InsertTable::from_inverse(self.patch.inverse())),
        )
    }
}

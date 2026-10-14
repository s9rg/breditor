//! Delete one stable row locally; exact inverse retains its rich base-cell subtrees.

use super::{
    InsertTableRow, RichAction, RichActionError, RichEdit,
    table_patch::{TablePatch, rebuild, table_node},
};
use crate::{
    rich_content::{RichDocument, RowId, TableId},
    state::EditorContext,
};

/// Captured local row deletion; deleting the final row keeps a hidden table.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DeleteTableRow {
    patch: TablePatch,
    row: RowId,
}

impl DeleteTableRow {
    /// Capture a visible row without flattening merged bodies or editing merge intent.
    ///
    /// # Errors
    /// Rejects a missing table/row or an inconsistent private directory.
    pub fn capture(
        document: &RichDocument,
        table: &TableId,
        row: &RowId,
    ) -> Result<Self, RichActionError> {
        let view = document.table(table)?.ok_or(RichActionError::MissingTarget)?;
        let index =
            view.rows().iter().position(|id| id == row).ok_or(RichActionError::MissingTarget)?;
        let source = table_node(document, table)?;
        let mut rows = source.as_element().ok_or(RichActionError::Rewrite)?.children().to_vec();
        rows.remove(index);
        Ok(Self {
            patch: TablePatch::capture(document, table, rebuild(source, None, rows)?)?,
            row: row.clone(),
        })
    }
    pub(super) fn from_inverse(patch: TablePatch, row: RowId) -> Self {
        Self { patch, row }
    }
    /// Apply the exact captured deletion and produce a guarded restoration action.
    ///
    /// # Errors
    /// Rejects later table edits rather than erasing them, or active binding/policy failures.
    pub fn apply(
        &self,
        context: &EditorContext,
        document: &RichDocument,
    ) -> Result<Option<RichEdit>, RichActionError> {
        let candidate = self.patch.apply(context, document)?;
        Ok(Some(RichEdit {
            before: document.clone(),
            document: candidate,
            inverse: RichAction::InsertTableRow(InsertTableRow::from_inverse(
                self.patch.inverse(),
                self.row.clone(),
            )),
        }))
    }
}

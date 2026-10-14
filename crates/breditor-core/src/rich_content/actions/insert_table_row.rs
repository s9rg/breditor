//! Insert one explicitly drafted stable row; all base-cell bodies are retained.

use super::{
    DeleteTableRow, RichAction, RichActionError, RichEdit,
    table_patch::{TablePatch, rebuild, table_node},
};
use crate::{
    rich_content::{RichDocument, RowId, TableId, TableRowDraft, ast_properties},
    state::EditorContext,
};

/// Captured local row insertion with an exact whole-table stale guard.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct InsertTableRow {
    patch: TablePatch,
    row: RowId,
}

impl InsertTableRow {
    /// Insert before a current stable row, or append when `before` is `None`.
    ///
    /// # Errors
    /// Rejects missing tables/anchors, duplicate row IDs, axis/product ceilings
    /// and drafts whose explicit cells do not match current column order.
    pub fn capture(
        document: &RichDocument,
        table: &TableId,
        before: Option<&RowId>,
        draft: TableRowDraft,
    ) -> Result<Self, RichActionError> {
        let view = document.table(table)?.ok_or(RichActionError::MissingTarget)?;
        if view.rows().contains(draft.row()) {
            return Err(RichActionError::AxisIdentityReuse);
        }
        if view.rows().len() >= 256
            || (view.rows().len() + 1)
                .checked_mul(view.columns().len())
                .is_none_or(|count| count > 4096)
        {
            return Err(RichActionError::TableLimit);
        }
        let index = before.map_or(Ok(view.rows().len()), |id| {
            view.rows().iter().position(|row| row == id).ok_or(RichActionError::MissingTarget)
        })?;
        let row = draft.row().clone();
        let node = draft.into_node();
        let children = node.as_element().ok_or(RichActionError::Rewrite)?.children();
        if children.len() != view.columns().len()
            || children.iter().zip(view.columns()).any(|(cell, column)| {
                cell.as_element().and_then(|cell| ast_properties::string(cell, "column-id").ok())
                    != Some(column.id().as_str())
            })
        {
            return Err(RichActionError::AxisShape);
        }
        let source = table_node(document, table)?;
        let mut rows = source.as_element().ok_or(RichActionError::Rewrite)?.children().to_vec();
        rows.insert(index, node);
        Ok(Self { patch: TablePatch::capture(document, table, rebuild(source, None, rows)?)?, row })
    }
    pub(super) fn from_inverse(patch: TablePatch, row: RowId) -> Self {
        Self { patch, row }
    }
    /// Apply only while the captured table still matches, even if its root path moved.
    ///
    /// # Errors
    /// Rejects stale content, binding mismatches, duplicate node IDs or active host limits.
    pub fn apply(
        &self,
        context: &EditorContext,
        document: &RichDocument,
    ) -> Result<Option<RichEdit>, RichActionError> {
        let candidate = self.patch.apply(context, document)?;
        Ok(Some(RichEdit {
            before: document.clone(),
            document: candidate,
            inverse: RichAction::DeleteTableRow(DeleteTableRow::from_inverse(
                self.patch.inverse(),
                self.row.clone(),
            )),
        }))
    }
}

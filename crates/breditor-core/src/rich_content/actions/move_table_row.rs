//! Move one stable row, preserving cell bodies and original merge-axis context.

use super::{
    RichAction, RichActionError, RichEdit,
    move_axis::move_before,
    table_patch::{TablePatch, rebuild, table_node},
};
use crate::{
    rich_content::{RichDocument, RowId, TableId},
    state::EditorContext,
};

/// Exact guarded local row move; an absent before-anchor means append.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MoveTableRow {
    patch: TablePatch,
}

impl MoveTableRow {
    /// Capture a row move in stable-ID space, never by a durable numeric index.
    ///
    /// # Errors
    /// Rejects absent tables, source rows or before-anchors.
    pub fn capture(
        document: &RichDocument,
        table: &TableId,
        row: &RowId,
        before: Option<&RowId>,
    ) -> Result<Self, RichActionError> {
        let view = document.table(table)?.ok_or(RichActionError::MissingTarget)?;
        let source =
            view.rows().iter().position(|id| id == row).ok_or(RichActionError::MissingTarget)?;
        let destination = before.map_or(Ok(view.rows().len()), |id| {
            view.rows().iter().position(|row| row == id).ok_or(RichActionError::MissingTarget)
        })?;
        let node = table_node(document, table)?;
        let mut rows = node.as_element().ok_or(RichActionError::Rewrite)?.children().to_vec();
        move_before(&mut rows, source, destination);
        Ok(Self { patch: TablePatch::capture(document, table, rebuild(node, None, rows)?)? })
    }

    /// Publish one complete row move with an exact inverse; unchanged order is a no-op.
    ///
    /// # Errors
    /// Rejects stale tables or active schema/resource policy failures, including no-ops.
    pub fn apply(
        &self,
        context: &EditorContext,
        document: &RichDocument,
    ) -> Result<Option<RichEdit>, RichActionError> {
        self.patch.edit(
            context,
            document,
            RichAction::MoveTableRow(Self { patch: self.patch.inverse() }),
        )
    }
}

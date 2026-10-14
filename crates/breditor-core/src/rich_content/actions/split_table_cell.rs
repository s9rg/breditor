//! Split a visible merged cell by retracting observed intents, never redistributing text.

use super::{
    MergeTableCells, RichAction, RichActionError, RichEdit, table_merges,
    table_patch::{TablePatch, table_node},
};
use crate::{
    rich_content::{CellId, RichDocument},
    state::EditorContext,
};

/// Exact guarded local split; the target may be a master or any covered base cell.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SplitTableCell {
    patch: TablePatch,
}

impl SplitTableCell {
    /// Split the target's presentation cell, including observed losing overlap intents.
    ///
    /// This prevents a known losing overlap from immediately reappearing inside
    /// the split area. Future unobserved merge identities are not retracted.
    /// A currently unmerged base cell is a guarded no-op.
    ///
    /// # Errors
    /// Rejects missing base cells, hidden tables or retraction limits.
    pub fn capture(document: &RichDocument, cell: &CellId) -> Result<Self, RichActionError> {
        if document.cell_path(cell).is_none() {
            return Err(RichActionError::MissingTarget);
        }
        let view = document.table(cell.table())?.ok_or(RichActionError::MissingTarget)?;
        let r = view
            .rows()
            .iter()
            .position(|row| row == cell.row())
            .ok_or(RichActionError::MissingTarget)?;
        let c = view
            .columns()
            .iter()
            .position(|column| column.id() == cell.column())
            .ok_or(RichActionError::MissingTarget)?;
        let resolved = view.geometry().cell(r, c).ok_or(RichActionError::MissingTarget)?;
        let master = resolved.master();
        let r0 = view
            .rows()
            .iter()
            .position(|row| row == master.row())
            .ok_or(RichActionError::Rewrite)?;
        let c0 = view
            .columns()
            .iter()
            .position(|column| column.id() == master.column())
            .ok_or(RichActionError::Rewrite)?;
        let resolved = view.geometry().cell(r0, c0).ok_or(RichActionError::Rewrite)?;
        let source = table_node(document, cell.table())?;
        let replacement = if resolved.source_cells().len() == 1 {
            source.clone()
        } else {
            let r1 = r0
                + usize::try_from(resolved.row_span()).map_err(|_| RichActionError::Rewrite)?
                - 1;
            let c1 = c0
                + usize::try_from(resolved.column_span()).map_err(|_| RichActionError::Rewrite)?
                - 1;
            let mut retracted = table_merges::retractions(source)?;
            table_merges::retract_overlaps(source, &view, (r0, r1, c0, c1), &mut retracted)?;
            table_merges::rewrite(source, table_merges::records(source)?, retracted)?
        };
        Ok(Self { patch: TablePatch::capture(document, cell.table(), replacement)? })
    }
    pub(super) fn from_inverse(patch: TablePatch) -> Self {
        Self { patch }
    }

    /// Publish one undoable split, preserving all source bodies and original records.
    ///
    /// # Errors
    /// Rejects stale tables or active schema/resource policy failure, including no-ops.
    pub fn apply(
        &self,
        context: &EditorContext,
        document: &RichDocument,
    ) -> Result<Option<RichEdit>, RichActionError> {
        self.patch.edit(
            context,
            document,
            RichAction::MergeTableCells(MergeTableCells::from_inverse(self.patch.inverse())),
        )
    }
}

//! Clear selected rich base bodies while retaining axes, widths, headers and merge geometry.

use super::{
    PasteTableCells, RichAction, RichActionError, RichEdit, table_body_rewrite,
    table_patch::{TablePatch, table_node},
};
use crate::{
    document::TextFragment,
    rich_content::{
        BlockId, ResolvedRichSelection, RichBlockDraft, RichDocument, RichSelection,
        TableCellPasteDraft,
    },
    state::EditorContext,
};

/// Exact selected-cell content clear, suitable for one clipboard Cut history unit.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ClearTableCells {
    patch: TablePatch,
}

impl ClearTableCells {
    /// Replace each selected base body with an explicitly identified empty paragraph.
    ///
    /// IDs are supplied in row-major order, including covered cells. Assets remain
    /// in local restoration data; clearing never deletes host asset-store bytes.
    ///
    /// # Errors
    /// Rejects non-grid/stale selections or wrong replacement-ID cardinality.
    pub fn capture(
        document: &RichDocument,
        selection: &RichSelection,
        empty_blocks: &[BlockId],
    ) -> Result<Self, RichActionError> {
        let ResolvedRichSelection::Grid(grid) = selection.resolve(document)? else {
            return Err(RichActionError::SelectionKind);
        };
        if empty_blocks.len() != grid.cells().len() {
            return Err(RichActionError::PasteShape);
        }
        let (r0, r1) = grid.rows();
        let (c0, c1) = grid.columns();
        let rows = empty_blocks
            .chunks(c1 - c0 + 1)
            .map(|row| {
                row.iter()
                    .map(|id| {
                        TableCellPasteDraft::try_new(
                            vec![RichBlockDraft::paragraph(id, &TextFragment::empty())?],
                            None,
                        )
                    })
                    .collect::<Result<Vec<_>, _>>()
            })
            .collect::<Result<Vec<_>, _>>()?;
        let table = grid.anchor().table();
        let source = table_node(document, table)?;
        Ok(Self {
            patch: TablePatch::capture(
                document,
                table,
                table_body_rewrite::replace(source, (r0, r1, c0, c1), rows)?,
            )?,
        })
    }
    /// Publish one complete clear with exact content restoration and unchanged merge presentation.
    ///
    /// # Errors
    /// Rejects stale tables, duplicate replacement IDs or active schema/resource policy.
    pub fn apply(
        &self,
        context: &EditorContext,
        document: &RichDocument,
    ) -> Result<Option<RichEdit>, RichActionError> {
        self.patch.edit(
            context,
            document,
            RichAction::PasteTableCells(PasteTableCells::from_inverse(self.patch.inverse())),
        )
    }
}

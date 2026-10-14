//! Paste a complete rich rectangle and relative merges as one guarded table edit.

use super::{
    RichAction, RichActionError, RichEdit, table_body_rewrite, table_merges,
    table_patch::{TablePatch, table_node},
};
use crate::{
    rich_content::{
        CellBounds, CellId, ResolvedRichSelection, RichDocument, RichSelection, TablePasteDraft,
        ast_properties,
    },
    state::EditorContext,
};

/// Exact guarded rich multicell paste; no silent crop, tiling or independent axis repair.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PasteTableCells {
    patch: TablePatch,
}

impl PasteTableCells {
    /// Replace a matching merge-closed grid with explicit rich bodies/header policy and fresh merges.
    ///
    /// Known target overlaps are retracted; source merges are translated to the
    /// target's stable axes. Every source base-cell body remains independently owned.
    ///
    /// # Errors
    /// Rejects non-grid/stale selections, dimension mismatch, reused merge IDs or count limits.
    pub fn capture(
        document: &RichDocument,
        selection: &RichSelection,
        draft: TablePasteDraft,
    ) -> Result<Self, RichActionError> {
        let ResolvedRichSelection::Grid(grid) = selection.resolve(document)? else {
            return Err(RichActionError::SelectionKind);
        };
        let (r0, r1) = grid.rows();
        let (c0, c1) = grid.columns();
        if draft.dimensions() != (r1 - r0 + 1, c1 - c0 + 1) {
            return Err(RichActionError::PasteShape);
        }
        let table = grid.anchor().table();
        let view = document.table(table)?.ok_or(RichActionError::MissingTarget)?;
        let source = table_node(document, table)?;
        let mut records = table_merges::records(source)?;
        let mut retracted = table_merges::retractions(source)?;
        if records.len() + draft.merges.len() > 256 {
            return Err(RichActionError::TableLimit);
        }
        table_merges::retract_overlaps(source, &view, (r0, r1, c0, c1), &mut retracted)?;
        let shape = table_merges::shape(&view)?;
        for merge in draft.merges {
            if retracted.contains(&merge.id)
                || records.iter().any(|value| {
                    value
                        .as_object()
                        .and_then(|value| value.get("id"))
                        .and_then(crate::document::PropertyValue::as_string)
                        == Some(merge.id.as_str())
                })
            {
                return Err(RichActionError::MergeIdentityReuse);
            }
            let cell = |row: usize, column: usize| {
                CellId::new(
                    table.clone(),
                    view.rows()[r0 + row].clone(),
                    view.columns()[c0 + column].id().clone(),
                )
            };
            let bounds = CellBounds::new(
                cell(merge.rows.0, merge.columns.0),
                cell(merge.rows.1, merge.columns.1),
            );
            let region = shape.capture_merge(merge.id, merge.stamp, &bounds)?;
            records.push(
                ast_properties::merge_property(&region).map_err(|_| RichActionError::Rewrite)?,
            );
        }
        let replacement = table_body_rewrite::replace(source, (r0, r1, c0, c1), draft.cells)?;
        let replacement = table_merges::rewrite(&replacement, records, retracted)?;
        Ok(Self { patch: TablePatch::capture(document, table, replacement)? })
    }
    pub(super) fn from_inverse(patch: TablePatch) -> Self {
        Self { patch }
    }
    /// Publish one complete paste with exact inverse retaining old bodies/headers/merge intent.
    ///
    /// # Errors
    /// Rejects stale tables, duplicate content IDs, unsupported nested tables/formats or host limits.
    pub fn apply(
        &self,
        context: &EditorContext,
        document: &RichDocument,
    ) -> Result<Option<RichEdit>, RichActionError> {
        self.patch.edit(
            context,
            document,
            RichAction::PasteTableCells(Self { patch: self.patch.inverse() }),
        )
    }
}

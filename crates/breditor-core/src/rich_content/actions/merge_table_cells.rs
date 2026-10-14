//! Merge a selection without flattening or reallocating any base-cell body.

use super::{
    RichAction, RichActionError, RichEdit, SplitTableCell, table_merges,
    table_patch::{TablePatch, table_node},
};
use crate::{
    rich_content::{
        CausalStamp, CellBounds, CellId, MergeId, ResolvedRichSelection, RichDocument,
        RichSelection, ast_properties,
    },
    state::EditorContext,
};

/// One guarded local merge, with fresh intent identity and host-provided causal stamp.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MergeTableCells {
    patch: TablePatch,
}

impl MergeTableCells {
    /// Merge the complete merge-closed grid and retract observed overlapping intents.
    ///
    /// Stamps are semantic values, not authentication evidence. The shared adapter
    /// must derive and verify them against the authored replicated change.
    ///
    /// # Errors
    /// Rejects non-grid/stale selections, singleton rectangles, reused merge IDs or limits.
    pub fn capture(
        document: &RichDocument,
        selection: &RichSelection,
        id: MergeId,
        stamp: CausalStamp,
    ) -> Result<Self, RichActionError> {
        let ResolvedRichSelection::Grid(grid) = selection.resolve(document)? else {
            return Err(RichActionError::SelectionKind);
        };
        let table = grid.anchor().table();
        let view = document.table(table)?.ok_or(RichActionError::MissingTarget)?;
        let source = table_node(document, table)?;
        let mut records = table_merges::records(source)?;
        let mut retracted = table_merges::retractions(source)?;
        if retracted.contains(&id)
            || records.iter().any(|value| {
                value
                    .as_object()
                    .and_then(|object| object.get("id"))
                    .and_then(crate::document::PropertyValue::as_string)
                    == Some(id.as_str())
            })
        {
            return Err(RichActionError::MergeIdentityReuse);
        }
        if records.len() >= 256 {
            return Err(RichActionError::TableLimit);
        }
        let (r0, r1) = grid.rows();
        let (c0, c1) = grid.columns();
        let bounds = CellBounds::new(
            CellId::new(table.clone(), view.rows()[r0].clone(), view.columns()[c0].id().clone()),
            CellId::new(table.clone(), view.rows()[r1].clone(), view.columns()[c1].id().clone()),
        );
        let region = table_merges::shape(&view)?.capture_merge(id, stamp, &bounds)?;
        table_merges::retract_overlaps(source, &view, (r0, r1, c0, c1), &mut retracted)?;
        records
            .push(ast_properties::merge_property(&region).map_err(|_| RichActionError::Rewrite)?);
        Ok(Self {
            patch: TablePatch::capture(
                document,
                table,
                table_merges::rewrite(source, records, retracted)?,
            )?,
        })
    }
    pub(super) fn from_inverse(patch: TablePatch) -> Self {
        Self { patch }
    }

    /// Publish one exact local merge edit and its inverse split recipe.
    ///
    /// # Errors
    /// Rejects a stale table or active schema/resource policy failure.
    pub fn apply(
        &self,
        context: &EditorContext,
        document: &RichDocument,
    ) -> Result<Option<RichEdit>, RichActionError> {
        self.patch.edit(
            context,
            document,
            RichAction::SplitTableCell(SplitTableCell::from_inverse(self.patch.inverse())),
        )
    }
}

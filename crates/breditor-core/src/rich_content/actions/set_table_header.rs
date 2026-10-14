//! Atomically set explicit header intent on every base cell in a selected grid.

use super::{
    RichAction, RichActionError, RichEdit,
    rewrite_properties::with_properties,
    table_patch::{TablePatch, rebuild, table_node},
};
use crate::{
    document::{NodeRef, PropertyValue},
    rich_content::{CellId, ResolvedRichSelection, RichDocument, RichSelection},
    state::EditorContext,
};
use std::collections::BTreeSet;

/// One exact guarded header action, including covered source cells.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SetTableHeader {
    patch: TablePatch,
}

impl SetTableHeader {
    /// Set header intent across the complete merge-closed grid, without changing bodies.
    ///
    /// # Errors
    /// Rejects non-grid/stale selections, missing tables or private AST invariants.
    pub fn capture(
        document: &RichDocument,
        selection: &RichSelection,
        header: bool,
    ) -> Result<Self, RichActionError> {
        let ResolvedRichSelection::Grid(grid) = selection.resolve(document)? else {
            return Err(RichActionError::SelectionKind);
        };
        let table = grid.anchor().table();
        let view = document.table(table)?.ok_or(RichActionError::MissingTarget)?;
        let selected: BTreeSet<_> = grid.cells().iter().collect();
        let source = table_node(document, table)?;
        let rows = source
            .as_element()
            .ok_or(RichActionError::Rewrite)?
            .children()
            .iter()
            .zip(view.rows())
            .map(|(row, id)| {
                let element = row.as_element().ok_or(RichActionError::Rewrite)?;
                let cells = element
                    .children()
                    .iter()
                    .zip(view.columns())
                    .map(|(cell, column)| {
                        if selected.contains(&CellId::new(
                            table.clone(),
                            id.clone(),
                            column.id().clone(),
                        )) {
                            with_properties(
                                cell,
                                [("header", Some(PropertyValue::boolean(header)))],
                            )
                        } else {
                            Ok(cell.clone())
                        }
                    })
                    .collect::<Result<_, RichActionError>>()?;
                Ok(NodeRef::element(
                    element.try_with_children(cells).map_err(|_| RichActionError::Rewrite)?,
                ))
            })
            .collect::<Result<_, RichActionError>>()?;
        Ok(Self { patch: TablePatch::capture(document, table, rebuild(source, None, rows)?)? })
    }

    /// Publish all selected header flags together; unchanged intent is a guarded no-op.
    ///
    /// # Errors
    /// Rejects stale tables or active schema/resource policy failures.
    pub fn apply(
        &self,
        context: &EditorContext,
        document: &RichDocument,
    ) -> Result<Option<RichEdit>, RichActionError> {
        self.patch.edit(
            context,
            document,
            RichAction::SetTableHeader(Self { patch: self.patch.inverse() }),
        )
    }
}

//! Insert one stable column and explicit per-row bodies as one admitted local edit.

use super::{
    DeleteTableColumn, RichAction, RichActionError, RichEdit,
    table_patch::{TablePatch, column_properties, rebuild, table_node},
};
use crate::{
    document::NodeRef,
    rich_content::{ColumnId, RichDocument, RowId, TableCellDraft, TableColumnDraft, TableId},
    state::EditorContext,
};
use std::collections::BTreeMap;

/// Captured local column insertion; cell drafts are addressed by stable row ID.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct InsertTableColumn {
    patch: TablePatch,
    column: ColumnId,
}

impl InsertTableColumn {
    /// Insert before a stable column, or append, with exactly one draft per current row.
    ///
    /// Row-draft input order is irrelevant. Duplicate row entries and extra/missing
    /// rows are rejected, not overwritten or silently assigned empty paragraphs.
    ///
    /// # Errors
    /// Rejects absent anchors, reused column IDs, wrong row/column bindings,
    /// count/product ceilings and internal draft invariants.
    pub fn capture(
        document: &RichDocument,
        table: &TableId,
        before: Option<&ColumnId>,
        draft: &TableColumnDraft,
        cells: Vec<(RowId, TableCellDraft)>,
    ) -> Result<Self, RichActionError> {
        let view = document.table(table)?.ok_or(RichActionError::MissingTarget)?;
        if view.columns().iter().any(|column| column.id() == draft.id()) {
            return Err(RichActionError::AxisIdentityReuse);
        }
        if view.columns().len() >= 128
            || view
                .rows()
                .len()
                .checked_mul(view.columns().len() + 1)
                .is_none_or(|count| count > 4096)
        {
            return Err(RichActionError::TableLimit);
        }
        if cells.len() != view.rows().len() {
            return Err(RichActionError::AxisShape);
        }
        let index = before.map_or(Ok(view.columns().len()), |id| {
            view.columns()
                .iter()
                .position(|column| column.id() == id)
                .ok_or(RichActionError::MissingTarget)
        })?;
        let mut bodies = BTreeMap::new();
        for (row, cell) in cells {
            if cell.column() != draft.id() {
                return Err(RichActionError::AxisShape);
            }
            match bodies.entry(row) {
                std::collections::btree_map::Entry::Vacant(entry) => {
                    entry.insert(cell.into_node());
                }
                std::collections::btree_map::Entry::Occupied(_) => {
                    return Err(RichActionError::AxisShape);
                }
            }
        }
        let source = table_node(document, table)?;
        let rows = source
            .as_element()
            .ok_or(RichActionError::Rewrite)?
            .children()
            .iter()
            .zip(view.rows())
            .map(|(node, row)| {
                let element = node.as_element().ok_or(RichActionError::Rewrite)?;
                let mut children = element.children().to_vec();
                children.insert(index, bodies.remove(row).ok_or(RichActionError::AxisShape)?);
                Ok(NodeRef::element(
                    element.try_with_children(children).map_err(|_| RichActionError::Rewrite)?,
                ))
            })
            .collect::<Result<_, RichActionError>>()?;
        if !bodies.is_empty() {
            return Err(RichActionError::AxisShape);
        }
        let mut columns = column_properties(source)?;
        columns.insert(index, draft.property()?);
        Ok(Self {
            patch: TablePatch::capture(document, table, rebuild(source, Some(columns), rows)?)?,
            column: draft.id().clone(),
        })
    }
    pub(super) fn from_inverse(patch: TablePatch, column: ColumnId) -> Self {
        Self { patch, column }
    }
    /// Apply a complete column/body insertion and produce one exact inverse.
    ///
    /// # Errors
    /// Rejects stale tables, malformed rich bodies, identity collisions or active limits.
    pub fn apply(
        &self,
        context: &EditorContext,
        document: &RichDocument,
    ) -> Result<Option<RichEdit>, RichActionError> {
        let candidate = self.patch.apply(context, document)?;
        Ok(Some(RichEdit {
            before: document.clone(),
            document: candidate,
            inverse: RichAction::DeleteTableColumn(DeleteTableColumn::from_inverse(
                self.patch.inverse(),
                self.column.clone(),
            )),
        }))
    }
}

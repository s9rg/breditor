//! Explicit rectangular table draft with fresh host-owned IDs and bodies.

use super::{
    BlockId, RichBlockDraft, RichDraftError, RichTableLimits, TableColumnDraft, TableId,
    TableRowDraft, TableShape, ast_properties, drafts::element,
};
use crate::document::{NodeRef, PropertyValue};

/// Immutable whole-table insertion draft, with no fabricated cells or merge metadata.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TableDraft {
    table: TableId,
    node: NodeRef,
}

impl TableDraft {
    /// Construct a unique rectangular table; zero axes retain the explicit hidden shape.
    ///
    /// Every cell/body and identity is supplied by the host. New visible tables should
    /// supply nonempty axes; this constructor never independently repairs a hidden table.
    ///
    /// # Errors
    /// Rejects duplicate axes, row/column misalignment, fixed count/product ceilings
    /// or internal draft invariants. Global node IDs/formats require final admission.
    pub fn try_new(
        block: &BlockId,
        table: TableId,
        columns: Vec<TableColumnDraft>,
        rows: Vec<TableRowDraft>,
    ) -> Result<Self, RichDraftError> {
        TableShape::try_new(
            table.clone(),
            rows.iter().map(|row| row.row().clone()).collect(),
            columns.iter().map(|column| column.id().clone()).collect(),
            RichTableLimits::default(),
        )
        .map_err(|error| {
            if error == super::TableGeometryError::Limit {
                RichDraftError::AxisLimit
            } else {
                RichDraftError::AxisShape
            }
        })?;
        for row in &rows {
            let cells = row.node().as_element().ok_or(RichDraftError::Invariant)?.children();
            if cells.len() != columns.len() {
                return Err(RichDraftError::AxisShape);
            }
            for (cell, column) in cells.iter().zip(&columns) {
                let cell = cell.as_element().ok_or(RichDraftError::Invariant)?;
                if ast_properties::string(cell, "column-id")
                    .map_err(|_| RichDraftError::Invariant)?
                    != column.id().as_str()
                {
                    return Err(RichDraftError::AxisShape);
                }
            }
        }
        let column_values =
            columns.into_iter().map(|column| column.property()).collect::<Result<_, _>>()?;
        let node = element(
            "table",
            vec![
                ("block-id", PropertyValue::from_string(block.as_str())),
                ("table-id", PropertyValue::from_string(table.as_str())),
                ("columns", PropertyValue::array(column_values)),
                ("merges", PropertyValue::array(vec![])),
                ("retracted-merges", PropertyValue::array(vec![])),
            ],
            rows.into_iter().map(TableRowDraft::into_node).collect(),
        )?;
        Ok(Self { table, node })
    }
    /// Stable whole-table identity, independent of its current flow position.
    #[must_use]
    pub const fn id(&self) -> &TableId {
        &self.table
    }
    pub(crate) fn into_node(self) -> NodeRef {
        self.node
    }
}

impl From<TableDraft> for RichBlockDraft {
    fn from(draft: TableDraft) -> Self {
        Self::from_node(draft.into_node())
    }
}

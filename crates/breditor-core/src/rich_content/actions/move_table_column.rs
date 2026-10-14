//! Move one stable column and every matching base-cell subtree atomically.

use super::{
    RichAction, RichActionError, RichEdit,
    move_axis::move_before,
    table_patch::{TablePatch, column_properties, rebuild, table_node},
};
use crate::{
    document::NodeRef,
    rich_content::{ColumnId, RichDocument, TableId},
    state::EditorContext,
};

/// Exact guarded local column move, retaining widths, headers and content IDs.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MoveTableColumn {
    patch: TablePatch,
}

impl MoveTableColumn {
    /// Capture a stable column move before another column, or append.
    ///
    /// # Errors
    /// Rejects absent tables, source columns or before-anchors.
    pub fn capture(
        document: &RichDocument,
        table: &TableId,
        column: &ColumnId,
        before: Option<&ColumnId>,
    ) -> Result<Self, RichActionError> {
        let view = document.table(table)?.ok_or(RichActionError::MissingTarget)?;
        let source = view
            .columns()
            .iter()
            .position(|id| id.id() == column)
            .ok_or(RichActionError::MissingTarget)?;
        let destination = before.map_or(Ok(view.columns().len()), |id| {
            view.columns()
                .iter()
                .position(|column| column.id() == id)
                .ok_or(RichActionError::MissingTarget)
        })?;
        let node = table_node(document, table)?;
        let mut columns = column_properties(node)?;
        move_before(&mut columns, source, destination);
        let rows = node
            .as_element()
            .ok_or(RichActionError::Rewrite)?
            .children()
            .iter()
            .map(|row| {
                let element = row.as_element().ok_or(RichActionError::Rewrite)?;
                let mut cells = element.children().to_vec();
                move_before(&mut cells, source, destination);
                Ok(NodeRef::element(
                    element.try_with_children(cells).map_err(|_| RichActionError::Rewrite)?,
                ))
            })
            .collect::<Result<_, RichActionError>>()?;
        Ok(Self {
            patch: TablePatch::capture(document, table, rebuild(node, Some(columns), rows)?)?,
        })
    }

    /// Publish the width/body permutation as one undoable edit; unchanged order is a no-op.
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
            RichAction::MoveTableColumn(Self { patch: self.patch.inverse() }),
        )
    }
}

//! Delete one stable column locally; exact inverse retains metadata and every body.

use super::{
    InsertTableColumn, RichAction, RichActionError, RichEdit,
    table_patch::{TablePatch, column_properties, rebuild, table_node},
};
use crate::{
    document::NodeRef,
    rich_content::{ColumnId, RichDocument, TableId},
    state::EditorContext,
};

/// Captured local column deletion; zero remaining columns keep a hidden table.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DeleteTableColumn {
    patch: TablePatch,
    column: ColumnId,
}

impl DeleteTableColumn {
    /// Capture one current column and its per-row rich content for exact local restoration.
    ///
    /// # Errors
    /// Rejects an absent table/column or an inconsistent private table directory.
    pub fn capture(
        document: &RichDocument,
        table: &TableId,
        column: &ColumnId,
    ) -> Result<Self, RichActionError> {
        let view = document.table(table)?.ok_or(RichActionError::MissingTarget)?;
        let index = view
            .columns()
            .iter()
            .position(|entry| entry.id() == column)
            .ok_or(RichActionError::MissingTarget)?;
        let source = table_node(document, table)?;
        let rows = source
            .as_element()
            .ok_or(RichActionError::Rewrite)?
            .children()
            .iter()
            .map(|node| {
                let element = node.as_element().ok_or(RichActionError::Rewrite)?;
                let mut children = element.children().to_vec();
                children.remove(index);
                Ok(NodeRef::element(
                    element.try_with_children(children).map_err(|_| RichActionError::Rewrite)?,
                ))
            })
            .collect::<Result<_, RichActionError>>()?;
        let mut columns = column_properties(source)?;
        columns.remove(index);
        Ok(Self {
            patch: TablePatch::capture(document, table, rebuild(source, Some(columns), rows)?)?,
            column: column.clone(),
        })
    }
    pub(super) fn from_inverse(patch: TablePatch, column: ColumnId) -> Self {
        Self { patch, column }
    }
    /// Apply without erasing any later table edits; inverse restores the exact captured tree.
    ///
    /// # Errors
    /// Rejects a changed table, binding mismatch or active host-policy violation.
    pub fn apply(
        &self,
        context: &EditorContext,
        document: &RichDocument,
    ) -> Result<Option<RichEdit>, RichActionError> {
        let candidate = self.patch.apply(context, document)?;
        Ok(Some(RichEdit {
            before: document.clone(),
            document: candidate,
            inverse: RichAction::InsertTableColumn(InsertTableColumn::from_inverse(
                self.patch.inverse(),
                self.column.clone(),
            )),
        }))
    }
}

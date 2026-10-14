//! Resize one stable table column; indices resolve only in the current snapshot.

use super::{
    RichAction, RichActionError, RichEdit,
    guard::TargetGuard,
    rewrite_properties::{integer, rewrite},
};
use crate::rich_content::{ColumnId, RichDocument, TableId, ast_properties};
use crate::{
    document::{PropertyObject, PropertyValue},
    state::EditorContext,
};
use std::collections::BTreeMap;

/// Captured local column-width action, independent of current row/column positions.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ResizeColumn {
    guard: TargetGuard,
    table: TableId,
    column: ColumnId,
    expected: u32,
    width: u32,
}

impl ResizeColumn {
    /// Capture one stable table/column and a bounded display width.
    ///
    /// # Errors
    /// Rejects an absent table/column or widths outside 32–4096 logical pixels.
    pub fn capture(
        document: &RichDocument,
        table: &TableId,
        column: &ColumnId,
        width: u32,
    ) -> Result<Self, RichActionError> {
        if !(32..=4096).contains(&width) {
            return Err(RichActionError::ColumnWidth);
        }
        let path = document.table_path(table).ok_or(RichActionError::MissingTarget)?;
        let view = document.table(table)?.ok_or(RichActionError::MissingTarget)?;
        let expected = view
            .columns()
            .iter()
            .find(|entry| entry.id() == column)
            .ok_or(RichActionError::MissingTarget)?
            .width();
        Ok(Self {
            guard: TargetGuard::capture(document, path)?,
            table: table.clone(),
            column: column.clone(),
            expected,
            width,
        })
    }

    /// Apply one width while preserving other columns, axes, merges and all cell bodies.
    ///
    /// # Errors
    /// Rejects a different document/schema, changed target width/identity, missing axes or host policy.
    pub fn apply(
        &self,
        context: &EditorContext,
        document: &RichDocument,
    ) -> Result<Option<RichEdit>, RichActionError> {
        let path = document.table_path(&self.table).ok_or(RichActionError::MissingTarget)?;
        self.guard.check(context, document, path)?;
        let view = document.table(&self.table)?.ok_or(RichActionError::MissingTarget)?;
        let index = view
            .columns()
            .iter()
            .position(|column| column.id() == &self.column)
            .ok_or(RichActionError::MissingTarget)?;
        let current = view.columns()[index].width();
        if current != self.expected {
            return Err(RichActionError::StaleTarget);
        }
        if current == self.width {
            return Ok(None);
        }
        let node = document
            .document()
            .node_at(path)
            .ok()
            .and_then(crate::document::NodeRef::as_element)
            .ok_or(RichActionError::Rewrite)?;
        let mut columns = ast_properties::property(node, "columns")
            .and_then(PropertyValue::as_array)
            .ok_or(RichActionError::Rewrite)?
            .to_vec();
        let mut value: BTreeMap<_, _> = columns[index]
            .as_object()
            .ok_or(RichActionError::Rewrite)?
            .iter()
            .map(|(key, value)| (key.to_owned(), value.clone()))
            .collect();
        value.insert("width".into(), integer(self.width)?);
        columns[index] = PropertyValue::object(
            PropertyObject::try_from_map(value).map_err(|_| RichActionError::Rewrite)?,
        );
        let candidate =
            rewrite(context, document, path, [("columns", Some(PropertyValue::array(columns)))])?;
        let inverse = Self::capture(&candidate, &self.table, &self.column, current)?;
        Ok(Some(RichEdit { document: candidate, inverse: RichAction::ResizeColumn(inverse) }))
    }
}

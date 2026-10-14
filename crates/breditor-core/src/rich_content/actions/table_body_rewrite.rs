//! Persistent base-cell body replacement retaining cell IDs, axes and unrequested metadata.

use super::{RichActionError, rewrite_properties::with_properties, table_patch::rebuild};
use crate::{
    document::{NodeRef, PropertyValue},
    rich_content::TableCellPasteDraft,
};

pub(super) fn replace(
    source: &NodeRef,
    rectangle: (usize, usize, usize, usize),
    bodies: Vec<Vec<TableCellPasteDraft>>,
) -> Result<NodeRef, RichActionError> {
    let (r0, r1, c0, c1) = rectangle;
    let mut bodies = bodies.into_iter().flatten();
    let mut rows = source.as_element().ok_or(RichActionError::Rewrite)?.children().to_vec();
    for row in &mut rows[r0..=r1] {
        let element = row.as_element().ok_or(RichActionError::Rewrite)?;
        let mut cells = element.children().to_vec();
        for cell in &mut cells[c0..=c1] {
            let (body, header) = bodies.next().ok_or(RichActionError::PasteShape)?.into_parts();
            let replacement = if let Some(header) = header {
                with_properties(cell, [("header", Some(PropertyValue::boolean(header)))])?
            } else {
                cell.clone()
            };
            *cell = NodeRef::element(
                replacement
                    .as_element()
                    .ok_or(RichActionError::Rewrite)?
                    .try_with_children(body)
                    .map_err(|_| RichActionError::Rewrite)?,
            );
        }
        *row = NodeRef::element(
            element.try_with_children(cells).map_err(|_| RichActionError::Rewrite)?,
        );
    }
    if bodies.next().is_some() {
        return Err(RichActionError::PasteShape);
    }
    rebuild(source, None, rows)
}

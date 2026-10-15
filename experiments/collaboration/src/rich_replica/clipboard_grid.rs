//! Translate an admitted re-keyed semantic table to fresh relative source-cell drafts.
use super::{
    RichReplica,
    actions::{PasteTableCells, PastedCell, PastedMerge},
};
use crate::Error;
use breditor_core::{identity::QualifiedName, rich_content::RichSelectionKind};
use serde_json::Value;

pub(super) fn targets(owner: &RichReplica) -> Result<(String, String), Error> {
    let selection = owner
        .selection()?
        .ok_or(Error::Contract("shared grid paste selection"))?
        .admit(&owner.document)?;
    let RichSelectionKind::Grid { anchor, focus } = selection.kind() else {
        return Err(Error::Contract("shared grid paste selection"));
    };
    let property = QualifiedName::try_new("breditor/block-id")
        .map_err(|_| Error::Contract("clipboard property"))?;
    let block = |cell| {
        owner
            .document
            .cell_path(cell)
            .and_then(|p| owner.document.document().node_at(p).ok())
            .and_then(|n| n.as_element())
            .and_then(|n| n.properties().get(&property))
            .and_then(breditor_core::document::PropertyValue::as_string)
            .map(str::to_owned)
            .ok_or(Error::Contract("shared paste cell identity"))
    };
    Ok((block(anchor)?, block(focus)?))
}

pub(super) fn draft(
    table: &Value,
    anchor: String,
    focus: String,
) -> Result<PasteTableCells, Error> {
    let mut cells = Vec::new();
    for row in table["children"].as_array().ok_or(Error::Contract("clipboard rows"))? {
        cells.push(
            row["children"]
                .as_array()
                .ok_or(Error::Contract("clipboard cells"))?
                .iter()
                .map(|cell| {
                    Ok(PastedCell {
                        body: cell["children"]
                            .as_array()
                            .ok_or(Error::Contract("clipboard cell body"))?
                            .clone(),
                        header: Some(
                            cell["properties"]["breditor/header"]
                                .as_bool()
                                .ok_or(Error::Contract("clipboard cell header"))?,
                        ),
                    })
                })
                .collect::<Result<Vec<_>, Error>>()?,
        );
    }
    let merges = super::clipboard_plan::records(table)?
        .iter()
        .map(|record| {
            Ok(PastedMerge {
                id: record["id"].as_str().ok_or(Error::Contract("clipboard merge ID"))?.into(),
                rows: bounds(record, "rows", "first-row", "last-row")?,
                columns: bounds(record, "columns", "first-column", "last-column")?,
            })
        })
        .collect::<Result<Vec<_>, Error>>()?;
    Ok(PasteTableCells { anchor, focus, cells, merges })
}
fn bounds(record: &Value, axis: &str, first: &str, last: &str) -> Result<[usize; 2], Error> {
    let values = record[axis].as_array().ok_or(Error::Contract("clipboard merge axes"))?;
    Ok([
        values
            .iter()
            .position(|v| v == &record[first])
            .ok_or(Error::Contract("clipboard merge start"))?,
        values
            .iter()
            .position(|v| v == &record[last])
            .ok_or(Error::Contract("clipboard merge end"))?,
    ])
}

//! Read-only rich view: authoritative document plus Rust-derived table geometry.

use super::{BreditorRichObservation, error, selection};
use crate::BreditorError;
use breditor_core::codec::{DocumentJsonCodecV2, RichFormatsJsonCodec};
use serde_json::json;

pub(super) fn encode(observation: &BreditorRichObservation) -> Result<String, BreditorError> {
    let state = observation.inner.state();
    let doc = state.document();
    let document = DocumentJsonCodecV2::new(observation.context.schema().clone())
        .with_limits(observation.context.limits().clone())
        .encode(doc.document())
        .map_err(|_| error::rejected("breditor_rich.document_read"))?;
    let formats = RichFormatsJsonCodec::new(observation.context.clone())
        .with_max_json_bytes(16 * 1024 * 1024);
    let pending = state
        .pending_formats()
        .map(|value| formats.encode(value))
        .transpose()
        .map_err(|_| error::rejected("breditor_rich.formats_read"))?;
    let mut tables = Vec::new();
    for id in doc.table_ids() {
        let table = doc
            .table(id)
            .map_err(|_| error::rejected("breditor_rich.view_read"))?
            .ok_or(error::rejected("breditor_rich.view_read"))?;
        let cells=table.geometry().cells().iter().map(|cell|json!({"base":selection::cell(cell.base()),"master":selection::cell(cell.master()),"rowSpan":cell.row_span(),"columnSpan":cell.column_span(),"sources":cell.source_cells().iter().map(selection::cell).collect::<Vec<_>>()})).collect::<Vec<_>>();
        tables.push(json!({"id":id.as_str(),"hidden":table.geometry().is_hidden(),"rows":table.rows().iter().map(breditor_core::rich_content::RowId::as_str).collect::<Vec<_>>(),"columns":table.columns().iter().map(|column|json!({"id":column.id().as_str(),"width":column.width()})).collect::<Vec<_>>(),"cells":cells}));
    }
    Ok(json!({"format":"breditor/rich-view","formatVersion":1,"documentJson":document,"revision":state.revision().get().to_string(),
        "selection":state.selection().map(|value|selection::encode(value.kind())),"pendingFormatsJson":pending,
        "undoDepth":observation.undo_depth,"redoDepth":observation.redo_depth,"historyCapacity":observation.capacity,"tables":tables}).to_string())
}

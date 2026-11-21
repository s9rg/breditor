//! Read-only rich view: authoritative document plus Rust-derived table geometry.

use super::{BreditorRichObservation, error, selection};
use crate::BreditorError;
use breditor_core::{
    codec::{DocumentJsonCodecV2, RichFormatsJsonCodec},
    rich_content::ResolvedRichSelection,
};
use serde_json::json;

pub(super) fn encode(observation: &BreditorRichObservation) -> Result<String, BreditorError> {
    if matches!(
        observation.inner.state().selection().map(breditor_core::rich_content::RichSelection::kind),
        Some(breditor_core::rich_content::RichSelectionKind::Document)
    ) {
        return Err(error::rejected("breditor_rich.document_view_family_required"));
    }
    encode_scope(observation, false)
}
pub(super) fn encode_document(
    observation: &BreditorRichObservation,
) -> Result<String, BreditorError> {
    encode_scope(observation, true)
}
fn encode_scope(
    observation: &BreditorRichObservation,
    document_scope: bool,
) -> Result<String, BreditorError> {
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
    let resolved = state
        .selection()
        .map(|selection| selection.resolve(doc))
        .transpose()
        .map_err(|_| error::rejected("breditor_rich.view_read"))?;
    let grid = match resolved {
        Some(ResolvedRichSelection::Grid(grid)) => Some(
            json!({"cells":grid.cells().iter().map(selection::cell).collect::<Vec<_>>(),"masters":grid.masters().iter().map(selection::cell).collect::<Vec<_>>()}),
        ),
        _ => None,
    };
    for id in doc.table_ids() {
        let table = doc
            .table(id)
            .map_err(|_| error::rejected("breditor_rich.view_read"))?
            .ok_or(error::rejected("breditor_rich.view_read"))?;
        let cells=table.geometry().cells().iter().map(|cell|json!({"base":selection::cell(cell.base()),"master":selection::cell(cell.master()),"rowSpan":cell.row_span(),"columnSpan":cell.column_span(),"sources":cell.source_cells().iter().map(selection::cell).collect::<Vec<_>>()})).collect::<Vec<_>>();
        tables.push(json!({"id":id.as_str(),"hidden":table.geometry().is_hidden(),"rows":table.rows().iter().map(breditor_core::rich_content::RowId::as_str).collect::<Vec<_>>(),"columns":table.columns().iter().map(|column|json!({"id":column.id().as_str(),"width":column.width()})).collect::<Vec<_>>(),"cells":cells}));
    }
    let mut view = json!({"format":if document_scope {"breditor/rich-document-view"}else{"breditor/rich-view"},"formatVersion":1,"documentJson":document,"revision":state.revision().get().to_string(),
        "selection":state.selection().map(|value|selection::encode(value.kind())),"pendingFormatsJson":pending,
        "undoDepth":observation.undo_depth,"redoDepth":observation.redo_depth,"historyCapacity":observation.capacity,"tables":tables,"grid":grid});
    // Omit false to retain every original default-view byte.
    if observation.inner.is_read_only() {
        view["readOnly"] = json!(true);
    }
    if observation.typing_history {
        view["historyGrouping"] = json!("typing-v1");
        view["historyStepCount"] = json!(observation.history_steps);
    }
    if let Some(revision) = observation.inner.read_only_revision() {
        view["readOnlyRevision"] = json!(revision.get().to_string());
    }
    if let Some(restricted) = super::restricted_editing::view(&observation.inner) {
        view["restricted"] = restricted;
    }
    Ok(view.to_string())
}

//! Frozen Rust-derived shared read view; no DOM paths are stored as durable selection identities.
use super::{
    RichReplica,
    selection::{CellTarget, SelectionOutcome},
};
use crate::Error;
use breditor_core::rich_content::ResolvedRichSelection;
use serde_json::json;

impl RichReplica {
    /// Immutable binding for the opt-in browser coordinator, independent of live observations.
    #[must_use]
    pub fn descriptor_json(&self) -> String {
        json!({"format":"breditor/shared-rich-owner","abiVersion":1,"modelVersion":super::MODEL_VERSION,"journalVersion":super::session::JOURNAL_VERSION,
            "schema":{"name":self.codec.schema().id().name().as_str(),"version":self.codec.schema().id().version().get()},"schemaFingerprint":self.codec.schema().fingerprint().to_string()}).to_string()
    }
    /// Read content, causal/version strings, selection, pending formats and original core geometry.
    /// # Errors
    /// Read admission/serialization failure has no shared or local mutation.
    pub fn view_json(&self) -> Result<String, Error> {
        let selection = self.selection()?;
        let resolved = selection
            .as_ref()
            .map(|selection| {
                selection
                    .admit(&self.document)?
                    .resolve(&self.document)
                    .map_err(|_| Error::Contract("shared view selection"))
            })
            .transpose()?;
        let grid = match resolved {
            Some(ResolvedRichSelection::Grid(grid)) => Some(
                json!({"cells":grid.cells().iter().map(CellTarget::from_core).collect::<Vec<_>>(),"masters":grid.masters().iter().map(CellTarget::from_core).collect::<Vec<_>>()}),
            ),
            _ => None,
        };
        let mut tables = vec![];
        for id in self.document.table_ids() {
            let table = self
                .document
                .table(id)
                .map_err(|_| Error::Contract("shared view table"))?
                .ok_or(Error::Contract("shared view table"))?;
            let cells=table.geometry().cells().iter().map(|cell|json!({"base":CellTarget::from_core(cell.base()),"master":CellTarget::from_core(cell.master()),"rowSpan":cell.row_span(),"columnSpan":cell.column_span(),"sources":cell.source_cells().iter().map(CellTarget::from_core).collect::<Vec<_>>()})).collect::<Vec<_>>();
            tables.push(json!({"id":id.as_str(),"hidden":table.geometry().is_hidden(),"rows":table.rows().iter().map(breditor_core::rich_content::RowId::as_str).collect::<Vec<_>>(),"columns":table.columns().iter().map(|value|json!({"id":value.id().as_str(),"width":value.width()})).collect::<Vec<_>>(),"cells":cells}));
        }
        Ok(json!({"format":"breditor/shared-rich-view","formatVersion":1,"documentJson":self.canonical,"revision":self.journal.publication,"causalVersion":self.causal_version(),"selection":selection,
            "selectionOutcome":self.journal.ui.outcome,"pendingFormatsJson":self.pending_formats().map(serde_json::to_string).transpose()?,"undoDepth":self.undo_count(),"redoDepth":self.redo_count(),"historyCapacity":1000,"tables":tables,"grid":grid}).to_string())
    }
    /// Last explicit selection mapping result, independent of shared content mutation.
    #[must_use]
    pub fn selection_outcome(&self) -> SelectionOutcome {
        self.journal.ui.outcome
    }
}

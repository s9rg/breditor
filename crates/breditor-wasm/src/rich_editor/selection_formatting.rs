//! Separate optional native selection-formatting/read capability, not a saved selection revision.
use super::{BreditorRichEditor, BreditorRichObservation, error};
use crate::{BreditorError, BreditorStringResult};
use breditor_core::{
    codec::{encode_rich_selection_coverage, encode_rich_selection_format_state},
    identity::QualifiedName,
    rich_content::{RichSelectionCoverage, inspect_selection_format},
};
use wasm_bindgen::prelude::*;
#[wasm_bindgen]
impl BreditorRichEditor {
    /// String1 supports native selection-derived formatting and distinct coverage/state reads.
    #[allow(clippy::unused_self)]
    #[must_use]
    #[wasm_bindgen(js_name=selectionFormattingVersion)]
    pub fn selection_formatting_version(&self) -> String {
        "1".to_owned()
    }
}
#[wasm_bindgen]
impl BreditorRichObservation {
    /// Read this frozen selection or explicit whole document without publishing.
    #[must_use]
    #[wasm_bindgen(js_name=selectionCoverageJson)]
    pub fn selection_coverage_json(&self, scope: &str) -> BreditorStringResult {
        match coverage(self, scope) {
            Ok(s) => BreditorStringResult::from_value(s),
            Err(e) => BreditorStringResult::from_error(e),
        }
    }
    /// Distinct mixed-state contract supports text, selected nodes and merged grids.
    #[must_use]
    #[wasm_bindgen(js_name=selectionFormatStateJson)]
    pub fn selection_format_state_json(&self, kind: &str) -> BreditorStringResult {
        match state(self, kind) {
            Ok(s) => BreditorStringResult::from_value(s),
            Err(e) => BreditorStringResult::from_error(e),
        }
    }
}
fn coverage(o: &BreditorRichObservation, scope: &str) -> Result<String, BreditorError> {
    let state = o.inner.state();
    let document = state.document();
    let coverage = match scope {
        "document" => Some(
            RichSelectionCoverage::document(document)
                .map_err(|_| error::rejected("breditor_rich.coverage"))?,
        ),
        "selection" => state
            .selection()
            .map(|s| RichSelectionCoverage::capture(document, s))
            .transpose()
            .map_err(|_| error::rejected("breditor_rich.coverage"))?,
        _ => return Err(error::rejected("breditor_rich.coverage_scope")),
    };
    encode_rich_selection_coverage(&o.context, document, coverage.as_ref())
        .map_err(|_| error::rejected("breditor_rich.coverage_read"))
}
fn state(o: &BreditorRichObservation, kind: &str) -> Result<String, BreditorError> {
    let kind = QualifiedName::try_new(kind)
        .map_err(|_| error::rejected("breditor_rich.selection_format_state"))?;
    let state = o.inner.state();
    let value = inspect_selection_format(
        &o.context,
        state.document(),
        state.selection(),
        state.pending_formats(),
        &kind,
    )
    .map_err(|_| error::rejected("breditor_rich.selection_format_state"))?;
    encode_rich_selection_format_state(&o.context, &kind, &value)
        .map_err(|_| error::rejected("breditor_rich.selection_format_state"))
}

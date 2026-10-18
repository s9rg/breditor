//! One-shot ownership transfer of an opaque search result; discarded wrappers release their read.
use super::BreditorRichSearchResults;
use crate::BreditorError;
use wasm_bindgen::prelude::wasm_bindgen;
/// Search read outcome, independent from any content/selection publication.
#[wasm_bindgen]
pub struct BreditorRichSearchResultsResult {
    results: Option<BreditorRichSearchResults>,
    error: Option<BreditorError>,
    succeeded: bool,
}
impl BreditorRichSearchResultsResult {
    pub(super) fn success(results: BreditorRichSearchResults) -> Self {
        Self { results: Some(results), error: None, succeeded: true }
    }
    pub(super) fn failure(error: BreditorError) -> Self {
        Self { results: None, error: Some(error), succeeded: false }
    }
}
#[wasm_bindgen]
impl BreditorRichSearchResultsResult {
    /// Returns results, taken, or error; transferring a read twice returns no object.
    #[must_use]
    #[wasm_bindgen(getter)]
    pub fn status(&self) -> String {
        if self.results.is_some() {
            "results"
        } else if self.succeeded {
            "taken"
        } else {
            "error"
        }
        .into()
    }
    /// Transfer the independently disposable frozen read exactly once.
    #[wasm_bindgen(js_name=takeResults)]
    pub fn take_results(&mut self) -> Option<BreditorRichSearchResults> {
        self.results.take()
    }
    /// Independently owned static, payload-redacting failure.
    #[must_use]
    #[wasm_bindgen(getter)]
    pub fn error(&self) -> Option<BreditorError> {
        self.error.clone()
    }
}

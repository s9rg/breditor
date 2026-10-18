//! Optional opaque search capability, with eight live reads per owner and no old command widening.
mod find;
mod owned_results;
mod replace_all;
mod replace_one;
mod result;
mod select_match;
use super::{BreditorRichEditor, BreditorRichObservation, error};
use crate::BreditorError;
pub use owned_results::BreditorRichSearchResults;
pub use result::BreditorRichSearchResultsResult;
use std::sync::Arc;
use wasm_bindgen::prelude::wasm_bindgen;

impl BreditorRichEditor {
    fn check_search(
        &self,
        observed: &BreditorRichObservation,
        results: &BreditorRichSearchResults,
    ) -> Result<(), BreditorError> {
        self.inner.check_observation(&observed.inner).map_err(|e| error::session(&e))?;
        if !Arc::ptr_eq(&self.search_owner, &results.owner) {
            return Err(error::rejected("breditor_rich.search_owner"));
        }
        results
            .inner
            .validate_for(self.inner.state().document())
            .map_err(|_| error::rejected("breditor_rich.search_source"))
    }
}
#[wasm_bindgen]
impl BreditorRichEditor {
    /// String1 means complete opaque search/find/navigation/replacement capabilities.
    #[must_use]
    #[allow(clippy::unused_self)]
    #[wasm_bindgen(js_name=searchVersion)]
    pub fn search_version(&self) -> String {
        "1".into()
    }
    /// Pure source/actor validation under the latest exact observation, including read-only owners.
    #[must_use]
    #[wasm_bindgen(js_name=checkSearchResults)]
    pub fn check_search_results(
        &self,
        observed: &BreditorRichObservation,
        results: &BreditorRichSearchResults,
    ) -> crate::BreditorStringResult {
        match self.check_search(observed, results) {
            Ok(()) => crate::BreditorStringResult::from_value("true".into()),
            Err(e) => crate::BreditorStringResult::from_error(e),
        }
    }
}

//! Publish exact native match selection; no caller-provided text coordinates are trusted.
use super::{
    super::{RichReplicaProbe, RichSharedObservation, error},
    RichSharedSearchResults,
};
use breditor_core::codec::decode_rich_search_index;
use wasm_bindgen::prelude::*;
#[cfg_attr(feature = "research", wasm_bindgen)]
#[cfg_attr(not(feature="research"),wasm_bindgen(js_class=SharedEditorOwner))]
impl RichReplicaProbe {
    /// Navigate a result in read-only or writable mode without enabling search history.
    pub fn select_search_match(
        &mut self,
        observed: &RichSharedObservation,
        results: &RichSharedSearchResults,
        index: &str,
    ) -> Result<bool, JsValue> {
        self.inner
            .validate_search_results_guarded(&observed.inner, &results.inner)
            .map_err(error)?;
        let index = decode_rich_search_index(index).map_err(error)?;
        self.inner
            .select_search_match_guarded(&observed.inner, &results.inner, index)
            .map_err(error)
    }
}

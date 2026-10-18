//! One complete guarded native splice; no new variant is accepted by old dispatch.
use super::{
    super::{RichReplicaProbe, RichSharedObservation, error},
    RichSharedSearchResults,
};
use breditor_core::codec::{decode_rich_search_index, decode_rich_search_replacement};
use wasm_bindgen::prelude::*;
#[cfg_attr(feature = "research", wasm_bindgen)]
#[cfg_attr(not(feature="research"),wasm_bindgen(js_class=SharedEditorOwner))]
impl RichReplicaProbe {
    /// Replace one exact native match after explicit search history selection.
    pub fn replace_search_one(
        &mut self,
        observed: &RichSharedObservation,
        results: &RichSharedSearchResults,
        index: &str,
        input: &str,
    ) -> Result<bool, JsValue> {
        self.inner
            .validate_search_results_guarded(&observed.inner, &results.inner)
            .map_err(error)?;
        let index = decode_rich_search_index(index).map_err(error)?;
        let replacement = decode_rich_search_replacement(input).map_err(error)?;
        self.inner
            .replace_search_one_guarded(&observed.inner, &results.inner, index, &replacement)
            .map_err(error)
    }
}

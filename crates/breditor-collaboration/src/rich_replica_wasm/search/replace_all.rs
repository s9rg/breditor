//! One atomic original-character bulk group, retaining exact causal source proof.
use super::{
    super::{RichReplicaProbe, RichSharedObservation, error},
    RichSharedSearchResults,
};
use breditor_core::codec::decode_rich_search_replacement;
use wasm_bindgen::prelude::*;
#[cfg_attr(feature = "research", wasm_bindgen)]
#[cfg_attr(not(feature="research"),wasm_bindgen(js_class=SharedEditorOwner))]
impl RichReplicaProbe {
    /// Replace all complete hits or publish nothing; ordinary command/update limits stay unchanged.
    pub fn replace_search_all(
        &mut self,
        observed: &RichSharedObservation,
        results: &RichSharedSearchResults,
        input: &str,
    ) -> Result<bool, JsValue> {
        self.inner
            .validate_search_results_guarded(&observed.inner, &results.inner)
            .map_err(error)?;
        let replacement = decode_rich_search_replacement(input).map_err(error)?;
        self.inner
            .replace_search_all_guarded(&observed.inner, &results.inner, &replacement)
            .map_err(error)
    }
}

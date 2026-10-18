//! Optional opaque native search, distinct from every old command/checkpoint family.
mod find;
mod history;
mod owned_results;
mod replace_all;
mod replace_one;
mod select_match;
use super::{RichReplicaProbe, RichSharedObservation, error};
pub use owned_results::RichSharedSearchResults;
use wasm_bindgen::prelude::*;
#[cfg_attr(feature = "research", wasm_bindgen)]
#[cfg_attr(not(feature="research"),wasm_bindgen(js_class=SharedEditorOwner))]
impl RichReplicaProbe {
    /// String1 requires complete opaque search, navigation and separate recovery support.
    #[allow(clippy::unused_self)]
    pub fn search_version(&self) -> String {
        "1".into()
    }
    /// Pure exact actor/source/causal proof under the current publication, including read-only mode.
    pub fn check_search_results(
        &self,
        observed: &RichSharedObservation,
        results: &RichSharedSearchResults,
    ) -> Result<(), JsValue> {
        self.inner.validate_search_results_guarded(&observed.inner, &results.inner).map_err(error)
    }
}

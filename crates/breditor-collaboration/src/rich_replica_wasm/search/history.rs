//! Explicit separate shared search history; no old save method is reinterpreted.
use super::super::{RichReplicaProbe, RichSharedObservation, error};
use wasm_bindgen::prelude::*;
#[cfg_attr(feature = "research", wasm_bindgen)]
#[cfg_attr(not(feature="research"),wasm_bindgen(js_class=SharedEditorOwner))]
impl RichReplicaProbe {
    /// Whether the actor has explicitly selected the separate search checkpoint family.
    pub fn search_history_enabled(&self) -> bool {
        self.inner.search_history_enabled()
    }
    /// Enable the new recovery family, preserving writer, content, scopes and all retained history.
    pub fn enable_search_history(
        &mut self,
        observed: &RichSharedObservation,
    ) -> Result<bool, JsValue> {
        self.inner.enable_search_history_guarded(&observed.inner).map_err(error)
    }
    /// Save only the explicit search family; old checkpoint getters continue refusing this mode.
    pub fn search_checkpoint(&self) -> Result<String, JsValue> {
        self.inner.search_checkpoint().map_err(error)
    }
}

//! Rust owns all targets and verifies native semantic equality before adopting one group.
use super::super::{RichReplicaProbe, RichSharedObservation, error};
use wasm_bindgen::prelude::*;
#[cfg_attr(feature = "research", wasm_bindgen)]
#[cfg_attr(not(feature="research"),wasm_bindgen(js_class=SharedEditorOwner))]
impl RichReplicaProbe {
    /// Apply closed set/remove/patch changes to the current native selection, not caller spans.
    pub fn change_selection_formats(
        &mut self,
        observation: &RichSharedObservation,
        input: &str,
    ) -> Result<bool, JsValue> {
        self.inner.change_selection_formats_json_guarded(&observation.inner, input).map_err(error)
    }
}

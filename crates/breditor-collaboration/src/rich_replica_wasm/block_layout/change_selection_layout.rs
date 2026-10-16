//! One guarded native layout edit; duplicate/unknown fields never pass through JS object parsing.
use super::super::{RichReplicaProbe, RichSharedObservation, error};
use wasm_bindgen::prelude::*;
#[cfg_attr(feature = "research", wasm_bindgen)]
#[cfg_attr(not(feature="research"),wasm_bindgen(js_class=SharedEditorOwner))]
impl RichReplicaProbe {
    /// Patch independent native fields across the current admitted selection atomically.
    pub fn change_selection_layout(
        &mut self,
        observation: &RichSharedObservation,
        input: &str,
    ) -> Result<bool, JsValue> {
        self.inner.change_selection_layout_json_guarded(&observation.inner, input).map_err(error)
    }
}

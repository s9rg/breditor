//! Explicit plain range with one host namespace and a native floor plan.
use super::super::{RichReplicaProbe, RichSharedObservation, error};
use wasm_bindgen::prelude::*;
#[cfg_attr(feature = "research", wasm_bindgen)]
#[cfg_attr(not(feature="research"),wasm_bindgen(js_class=SharedEditorOwner))]
impl RichReplicaProbe {
    /// Replace explicit plain input without overwriting the actual before-selection.
    pub fn replace_general_range_plain_text(
        &mut self,
        observation: &RichSharedObservation,
        input: &str,
    ) -> Result<bool, JsValue> {
        self.inner
            .replace_general_range_plain_text_namespace_json_guarded(&observation.inner, input)
            .map_err(error)
    }
}

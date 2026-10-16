//! Explicit first-key range; following native input may join but preceding input never does.
use super::super::{RichReplicaProbe, RichSharedObservation, error};
use wasm_bindgen::prelude::*;
#[cfg_attr(feature = "research", wasm_bindgen)]
#[cfg_attr(not(feature="research"),wasm_bindgen(js_class=SharedEditorOwner))]
impl RichReplicaProbe {
    /// Apply a closed native user-input request with exact decimal clock and namespace.
    pub fn replace_general_range_typing_text(
        &mut self,
        observation: &RichSharedObservation,
        input: &str,
    ) -> Result<bool, JsValue> {
        self.inner
            .replace_general_range_typing_text_namespace_json_guarded(&observation.inner, input)
            .map_err(error)
    }
}

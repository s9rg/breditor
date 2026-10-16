//! Explicit rich run request; canonical literal admission stays native.
use super::super::{RichReplicaProbe, RichSharedObservation, error};
use wasm_bindgen::prelude::*;
#[cfg_attr(feature = "research", wasm_bindgen)]
#[cfg_attr(not(feature="research"),wasm_bindgen(js_class=SharedEditorOwner))]
impl RichReplicaProbe {
    /// Apply rich runs and an explicit general target with native fresh-floor allocation.
    pub fn replace_general_range_text(
        &mut self,
        observation: &RichSharedObservation,
        input: &str,
    ) -> Result<bool, JsValue> {
        self.inner
            .replace_general_range_text_namespace_json_guarded(&observation.inner, input)
            .map_err(error)
    }
}

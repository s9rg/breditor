//! Explicit same-writer history continuation under the current native observation.
use super::super::{RichReplicaProbe, RichSharedObservation, error};
use wasm_bindgen::prelude::*;

#[cfg_attr(feature = "research", wasm_bindgen)]
#[cfg_attr(not(feature = "research"), wasm_bindgen(js_class = SharedEditorOwner))]
impl RichReplicaProbe {
    /// Retain every V1 file and start a continued archive under the existing writer.
    pub fn continue_history(
        &mut self,
        observed: &RichSharedObservation,
        next_generation: String,
    ) -> Result<(), JsValue> {
        self.inner.continue_history_guarded(&observed.inner, next_generation).map_err(error)
    }
}

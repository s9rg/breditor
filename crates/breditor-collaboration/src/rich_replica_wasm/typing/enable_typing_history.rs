//! Guarded explicit admission; no implicit default or checkpoint migration.
use super::super::{RichReplicaProbe, RichSharedObservation, error};
use wasm_bindgen::prelude::*;
#[cfg_attr(feature = "research", wasm_bindgen)]
#[cfg_attr(not(feature = "research"), wasm_bindgen(js_class = SharedEditorOwner))]
impl RichReplicaProbe {
    /// Select native grouped history once for this owner under its exact publication.
    pub fn enable_typing_history(
        &mut self,
        observation: &RichSharedObservation,
    ) -> Result<bool, JsValue> {
        self.inner.enable_typing_history_guarded(&observation.inner).map_err(error)
    }
}

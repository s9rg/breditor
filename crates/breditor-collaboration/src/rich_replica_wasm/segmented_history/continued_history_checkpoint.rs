//! Explicit save of the continued native document history family.
use super::super::{RichReplicaProbe, error};
use wasm_bindgen::prelude::*;

#[cfg_attr(feature = "research", wasm_bindgen)]
#[cfg_attr(not(feature = "research"), wasm_bindgen(js_class = SharedEditorOwner))]
impl RichReplicaProbe {
    /// Identify the continued archive without serializing the native history.
    pub fn continued_history_enabled(&self) -> bool {
        self.inner.continued_history_enabled()
    }

    /// Save the original root, all native files and the migration boundary.
    pub fn continued_history_checkpoint(&self) -> Result<String, JsValue> {
        self.inner.continued_history_checkpoint().map_err(error)
    }
}

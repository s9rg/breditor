//! Explicit initial host policy; never a permission restored from saved data.
use super::{RichReplicaProbe, error};
use wasm_bindgen::prelude::*;

#[cfg_attr(feature = "research", wasm_bindgen)]
#[cfg_attr(not(feature = "research"), wasm_bindgen(js_class = SharedEditorOwner))]
impl RichReplicaProbe {
    /// Version1 permits one policy initialization before any native observation is issued.
    #[allow(clippy::unused_self)]
    pub fn initial_read_only_version(&self) -> String {
        "1".into()
    }

    /// Apply fresh host policy without changing checkpoint bytes or publication counters.
    ///
    /// Refuses after either observation family is issued, or after one successful
    /// initialization (including false). Later changes must use guarded `set_read_only`.
    pub fn initialize_read_only(&mut self, read_only: bool) -> Result<(), JsValue> {
        self.initial_read_only.initialize(&mut self.inner, read_only).map_err(error)
    }
}

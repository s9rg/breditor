//! Matching semantic-family save getters for explicitly recovered owners.
use super::{RichReplicaProbe, error};
use wasm_bindgen::prelude::*;
#[cfg_attr(feature = "research", wasm_bindgen)]
#[cfg_attr(not(feature = "research"), wasm_bindgen(js_class = SharedEditorOwner))]
impl RichReplicaProbe {
    /// Save only an explicitly general-range owner with ordinary selective history.
    pub fn general_checkpoint(&self) -> Result<String, JsValue> {
        self.inner.general_checkpoint().map_err(error)
    }
    /// Save only an explicitly general-range owner with natural selective history.
    pub fn general_typing_checkpoint(&self) -> Result<String, JsValue> {
        self.inner.general_typing_checkpoint().map_err(error)
    }
}

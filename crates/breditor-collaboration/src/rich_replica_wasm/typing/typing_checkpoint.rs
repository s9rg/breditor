//! Explicit capability and separate grouped recovery export, never old-journal flattening.
use super::super::{RichReplicaProbe, error};
use wasm_bindgen::prelude::*;
#[cfg_attr(feature = "research", wasm_bindgen)]
#[cfg_attr(not(feature = "research"), wasm_bindgen(js_class = SharedEditorOwner))]
impl RichReplicaProbe {
    /// Additive capability for strict native typing groups and their separate checkpoint.
    #[allow(clippy::unused_self)]
    pub fn typing_history_version(&self) -> String {
        "1".to_owned()
    }
    /// Export only an explicitly enabled grouped owner; original checkpoint remains strict.
    pub fn typing_checkpoint(&self) -> Result<String, JsValue> {
        self.inner.typing_checkpoint().map_err(error)
    }
}

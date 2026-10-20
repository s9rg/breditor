//! Segmented-history information: detached reads, never publication or admission proof.
use super::super::{RichReplicaProbe, error};
use wasm_bindgen::prelude::*;
#[cfg_attr(feature = "research", wasm_bindgen)]
#[cfg_attr(not(feature="research"),wasm_bindgen(js_class=SharedEditorOwner))]
impl RichReplicaProbe {
    /// Complete separate segmented checkpoint, mutation and native continuity capability version.
    #[allow(clippy::unused_self)]
    pub fn segmented_history_version(&self) -> String {
        "1".into()
    }
    /// Whether this native owner requires explicitly selected segmented storage and recovery.
    pub fn segmented_history_enabled(&self) -> bool {
        self.inner.segmented_history_enabled()
    }
    /// Read bounded native generation metadata, or null on an original-family owner.
    pub fn segmented_history_info_json(&self) -> Result<String, JsValue> {
        serde_json::to_string(&self.inner.segmented_history_info()).map_err(error)
    }
}

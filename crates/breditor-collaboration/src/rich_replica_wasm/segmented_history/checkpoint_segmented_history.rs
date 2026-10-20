//! Checkpoint-segmented-history/v1. Original save methods still refuse this separate mode.
use super::super::{RichReplicaProbe, error};
use wasm_bindgen::prelude::*;
#[cfg_attr(feature = "research", wasm_bindgen)]
#[cfg_attr(not(feature="research"),wasm_bindgen(js_class=SharedEditorOwner))]
impl RichReplicaProbe {
    /// Save the exact original root and every linked native input without pruning or resetting.
    pub fn segmented_checkpoint(&self) -> Result<String, JsValue> {
        self.inner.segmented_checkpoint().map_err(error)
    }
}

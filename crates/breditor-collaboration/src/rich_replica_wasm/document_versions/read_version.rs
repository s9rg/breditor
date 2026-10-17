//! Closed semantic version validation before exposing descriptive imported metadata.
use super::super::{RichReplicaProbe, error};
use wasm_bindgen::prelude::*;
#[cfg_attr(feature = "research", wasm_bindgen)]
#[cfg_attr(not(feature="research"),wasm_bindgen(js_class=SharedEditorOwner))]
impl RichReplicaProbe {
    /// Admit version digest, document/profile/engine and content without importing causal history.
    pub fn read_document_version(&self, input: &str) -> Result<String, JsValue> {
        serde_json::to_string(&self.inner.read_document_version(input).map_err(error)?)
            .map_err(error)
    }
}

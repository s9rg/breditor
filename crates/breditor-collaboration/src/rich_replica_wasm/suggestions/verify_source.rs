//! Prove the original native intent at its historical source without checking out the live owner.
use super::super::{RichReplicaProbe, error};
use wasm_bindgen::prelude::*;
#[cfg_attr(feature = "research", wasm_bindgen)]
#[cfg_attr(not(feature = "research"), wasm_bindgen(js_class = SharedEditorOwner))]
impl RichReplicaProbe {
    /// Original source proof or explicit missing operations; not host authorization or finalization.
    pub fn verify_document_suggestion_source(&self, input: &str) -> Result<String, JsValue> {
        serde_json::to_string(&self.inner.verify_document_suggestion_source(input).map_err(error)?)
            .map_err(error)
    }
}

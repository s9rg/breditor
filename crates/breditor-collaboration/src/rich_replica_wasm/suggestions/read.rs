//! Read closed native proposal metadata; no JavaScript digest reconstruction supplies authority.
use super::super::{RichReplicaProbe, error};
use wasm_bindgen::prelude::*;
#[cfg_attr(feature = "research", wasm_bindgen)]
#[cfg_attr(not(feature = "research"), wasm_bindgen(js_class = SharedEditorOwner))]
impl RichReplicaProbe {
    /// Admit original packet identity, document/source binding and descriptive creator/title.
    pub fn read_document_suggestion(&self, input: &str) -> Result<String, JsValue> {
        serde_json::to_string(&self.inner.read_document_suggestion(input).map_err(error)?)
            .map_err(error)
    }
}

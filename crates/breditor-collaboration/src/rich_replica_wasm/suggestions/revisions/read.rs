//! Descriptive admission alone grants no account right, source proof or final decision.
use super::super::super::{RichReplicaProbe, error};
use wasm_bindgen::prelude::*;
#[cfg_attr(feature = "research", wasm_bindgen)]
#[cfg_attr(not(feature="research"),wasm_bindgen(js_class=SharedEditorOwner))]
impl RichReplicaProbe {
    /// Read closed native revision metadata against its exact immutable predecessor packet.
    pub fn read_document_suggestion_revision(
        &self,
        previous: &str,
        input: &str,
    ) -> Result<String, JsValue> {
        serde_json::to_string(
            &self.inner.read_document_suggestion_revision(previous, input).map_err(error)?,
        )
        .map_err(error)
    }
}

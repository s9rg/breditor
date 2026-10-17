//! Native historical source proof, independent of authenticated server supersession/finality.
use super::super::super::{RichReplicaProbe, error};
use wasm_bindgen::prelude::*;
#[cfg_attr(feature = "research", wasm_bindgen)]
#[cfg_attr(not(feature="research"),wasm_bindgen(js_class=SharedEditorOwner))]
impl RichReplicaProbe {
    /// Return explicit pending native dependencies or the verified immutable relation/source cuts.
    pub fn verify_document_suggestion_revision(
        &self,
        previous: &str,
        input: &str,
    ) -> Result<String, JsValue> {
        serde_json::to_string(
            &self.inner.verify_document_suggestion_revision(previous, input).map_err(error)?,
        )
        .map_err(error)
    }
}

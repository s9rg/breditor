//! Thin semantic comparison transfer; no JavaScript tree or DOM diff supplies the result.
use super::super::{RichReplicaProbe, RichSharedObservation, error};
use wasm_bindgen::prelude::*;
#[cfg_attr(feature = "research", wasm_bindgen)]
#[cfg_attr(not(feature="research"),wasm_bindgen(js_class=SharedEditorOwner))]
impl RichReplicaProbe {
    /// Read exact native block/text/format/property/asset differences under the current guard.
    pub fn compare_document_version(
        &self,
        observed: &RichSharedObservation,
        input: &str,
    ) -> Result<String, JsValue> {
        serde_json::to_string(
            &self.inner.compare_document_version_guarded(&observed.inner, input).map_err(error)?,
        )
        .map_err(error)
    }
}

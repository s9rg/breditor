//! Explicit source verification; older version readers keep admitting descriptive imported claims.
use super::super::{RichReplicaProbe, error};
use wasm_bindgen::prelude::*;
#[cfg_attr(feature = "research", wasm_bindgen)]
#[cfg_attr(not(feature="research"),wasm_bindgen(js_class=SharedEditorOwner))]
impl RichReplicaProbe {
    /// Separate native capability proving content against retained historical causal cuts.
    #[must_use]
    #[allow(clippy::unused_self)] // Capability is intentionally queried on a live generated owner.
    pub fn document_version_source_version(&self) -> String {
        "1".into()
    }
    /// Prove or defer an immutable version's claimed source; this is not an authenticated acceptance.
    pub fn verify_document_version_source(&self, input: &str) -> Result<String, JsValue> {
        serde_json::to_string(&self.inner.verify_document_version_source(input).map_err(error)?)
            .map_err(error)
    }
}

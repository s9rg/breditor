//! Exact immutable replacement extraction, not an independent-publication fallback.
use super::super::super::{RichReplicaProbe, error};
use wasm_bindgen::prelude::*;
#[cfg_attr(feature = "research", wasm_bindgen)]
#[cfg_attr(not(feature="research"),wasm_bindgen(js_class=SharedEditorOwner))]
impl RichReplicaProbe {
    /// Extract the original V1 replacement only after native relation admission. Hosts must submit
    /// the revision transaction; this read does not authorize standalone publication or Accept.
    pub fn document_suggestion_revision_packet(
        &self,
        previous: &str,
        input: &str,
    ) -> Result<String, JsValue> {
        self.inner.document_suggestion_revision_packet(previous, input).map_err(error)
    }
}

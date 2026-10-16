//! Thin guarded document formatting boundary; native code owns coverage, lowering and history.
use super::super::{RichReplicaProbe, RichSharedObservation, error};
use wasm_bindgen::prelude::*;
#[cfg_attr(feature = "research", wasm_bindgen)]
#[cfg_attr(not(feature="research"),wasm_bindgen(js_class=SharedEditorOwner))]
impl RichReplicaProbe {
    /// Apply document-family formatting without an old selection-DTO fallback.
    pub fn change_document_selection_formats(
        &mut self,
        observation: &RichSharedObservation,
        input: &str,
    ) -> Result<bool, JsValue> {
        self.inner
            .change_document_selection_formats_json_guarded(&observation.inner, input)
            .map_err(error)
    }
}

//! Thin guarded document-scope boundary; native policy owns admission, history and recovery.
use super::super::{RichReplicaProbe, RichSharedObservation, error};
use wasm_bindgen::prelude::*;
#[cfg_attr(feature = "research", wasm_bindgen)]
#[cfg_attr(not(feature = "research"), wasm_bindgen(js_class = SharedEditorOwner))]
impl RichReplicaProbe {
    /// Replace the observed document scope with one fresh plain paragraph in one selective history group.
    pub fn replace_document_plain_text(
        &mut self,
        observation: &RichSharedObservation,
        input: &str,
    ) -> Result<bool, JsValue> {
        self.inner
            .replace_document_plain_text_json_guarded(&observation.inner, input)
            .map_err(error)
    }
}

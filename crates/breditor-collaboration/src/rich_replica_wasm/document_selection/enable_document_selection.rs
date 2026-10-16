//! Thin guarded document-scope boundary; native policy owns admission, history and recovery.
use super::super::{RichReplicaProbe, RichSharedObservation, error};
use wasm_bindgen::prelude::*;
#[cfg_attr(feature = "research", wasm_bindgen)]
#[cfg_attr(not(feature = "research"), wasm_bindgen(js_class = SharedEditorOwner))]
impl RichReplicaProbe {
    /// Select the separate document-selection family without changing content or either history stack.
    pub fn enable_document_selection(
        &mut self,
        observation: &RichSharedObservation,
    ) -> Result<bool, JsValue> {
        self.inner.enable_document_selection_guarded(&observation.inner).map_err(error)
    }
}

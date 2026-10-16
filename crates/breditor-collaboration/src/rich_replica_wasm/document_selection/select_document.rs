//! Thin guarded document-scope boundary; native policy owns admission, history and recovery.
use super::super::{RichReplicaProbe, RichSharedObservation, error};
use wasm_bindgen::prelude::*;
#[cfg_attr(feature = "research", wasm_bindgen)]
#[cfg_attr(not(feature = "research"), wasm_bindgen(js_class = SharedEditorOwner))]
impl RichReplicaProbe {
    /// Select the current complete root, including no-text atoms, without authoring shared content.
    pub fn select_document(
        &mut self,
        observation: &RichSharedObservation,
    ) -> Result<bool, JsValue> {
        self.inner.select_document_guarded(&observation.inner).map_err(error)
    }
}

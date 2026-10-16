//! Guarded opt-in never reinterprets an old checkpoint or dispatch operation.
use super::super::{RichReplicaProbe, RichSharedObservation, error};
use wasm_bindgen::prelude::*;
#[cfg_attr(feature = "research", wasm_bindgen)]
#[cfg_attr(not(feature="research"),wasm_bindgen(js_class=SharedEditorOwner))]
impl RichReplicaProbe {
    /// Select general semantic history while retaining content and both old stacks.
    pub fn enable_general_ranges(
        &mut self,
        observation: &RichSharedObservation,
    ) -> Result<bool, JsValue> {
        self.inner.enable_general_ranges_guarded(&observation.inner).map_err(error)
    }
}

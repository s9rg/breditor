//! Enable-segmented-history/v1 only after the host pins every original native replay capability.
use super::super::{RichReplicaProbe, RichSharedObservation, error};
use wasm_bindgen::prelude::*;
#[cfg_attr(feature = "research", wasm_bindgen)]
#[cfg_attr(not(feature="research"),wasm_bindgen(js_class=SharedEditorOwner))]
impl RichReplicaProbe {
    /// Retain the original root and history without authoring document or comment operations.
    /// IDs, policies, write access and exact observation are checked by the native owner.
    pub fn enable_segmented_history(
        &mut self,
        observed: &RichSharedObservation,
        root_generation: String,
        active_generation: String,
    ) -> Result<(), JsValue> {
        self.inner
            .enable_segmented_history_guarded(&observed.inner, root_generation, active_generation)
            .map_err(error)
    }
}

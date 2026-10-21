//! Independently versioned passive document archival, never an authoring or observer downgrade.
use super::super::{RichReplicaProbe, RichSharedObservation, error};
use wasm_bindgen::prelude::*;
#[cfg_attr(feature = "research", wasm_bindgen)]
#[cfg_attr(not(feature = "research"),wasm_bindgen(js_class=SharedEditorOwner))]
impl RichReplicaProbe {
    /// Discover separate current-read-only archive boundaries, including retained former-author inputs.
    #[allow(clippy::unused_self)]
    pub fn read_only_history_lifecycle_version(&self) -> String {
        "1".into()
    }
    /// Retain the actual original root without changing current read-only or resetting history.
    pub fn enable_read_only_segmented_history(
        &mut self,
        observed: &RichSharedObservation,
        root: String,
        active: String,
    ) -> Result<(), JsValue> {
        self.inner
            .enable_read_only_segmented_history_guarded(&observed.inner, root, active)
            .map_err(error)
    }
}

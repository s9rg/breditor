//! Separate general Copy capability; the original read remains unchanged.
use super::{RichReplicaProbe, RichSharedObservation, error};
use wasm_bindgen::prelude::*;
#[cfg_attr(feature = "research", wasm_bindgen)]
#[cfg_attr(not(feature="research"),wasm_bindgen(js_class=SharedEditorOwner))]
impl RichReplicaProbe {
    /// String1 retains partial table axes with neutral unselected cells.
    #[allow(clippy::unused_self)]
    pub fn general_copy_version(&self) -> String {
        "1".to_owned()
    }
    /// Pure observation-scoped read, also allowed when authoring is read-only.
    pub fn copy_general_clipboard(
        &self,
        observation: &RichSharedObservation,
    ) -> Result<String, JsValue> {
        serde_json::to_string(
            &self.inner.copy_general_clipboard_guarded(&observation.inner).map_err(error)?,
        )
        .map_err(error)
    }
}

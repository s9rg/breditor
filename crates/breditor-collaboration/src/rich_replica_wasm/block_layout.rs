//! Explicit shared layout capability and guarded native mixed-state reads.
mod change_selection_layout;
use super::{RichReplicaProbe, RichSharedObservation, error};
use wasm_bindgen::prelude::*;
#[cfg_attr(feature = "research", wasm_bindgen)]
#[cfg_attr(not(feature="research"),wasm_bindgen(js_class=SharedEditorOwner))]
impl RichReplicaProbe {
    /// String1 means this owner selected V3 or V4; old V1/V2 owners report String0.
    #[must_use]
    pub fn block_layout_version(&self) -> String {
        if matches!(self.inner.model_version(), 13 | 14) { "1" } else { "0" }.into()
    }
    /// Read original native selection layout after the exact opaque observation guard.
    pub fn block_layout_state_json(
        &self,
        observation: &RichSharedObservation,
    ) -> Result<String, JsValue> {
        self.inner.block_layout_state_json_guarded(&observation.inner).map_err(error)
    }
}

//! Passive document archive boundary; source observations and current policy remain native.
use super::super::{RichReplicaProbe, RichSharedObservation, error};
use wasm_bindgen::prelude::*;
#[cfg_attr(feature = "research", wasm_bindgen)]
#[cfg_attr(not(feature = "research"),wasm_bindgen(js_class=SharedEditorOwner))]
impl RichReplicaProbe {
    /// Seal a nonempty generation under current read-only, without resetting a former author.
    pub fn seal_read_only_history_segment(
        &mut self,
        observed: &RichSharedObservation,
        next: String,
    ) -> Result<(), JsValue> {
        self.inner.seal_read_only_history_segment_guarded(&observed.inner, next).map_err(error)
    }
}

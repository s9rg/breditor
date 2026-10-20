//! Seal-history-segment/v1 closes typing without resetting native or paired comment history.
use super::super::{RichReplicaProbe, RichSharedObservation, error};
use wasm_bindgen::prelude::*;
#[cfg_attr(feature = "research", wasm_bindgen)]
#[cfg_attr(not(feature="research"),wasm_bindgen(js_class=SharedEditorOwner))]
impl RichReplicaProbe {
    /// Seal the exact nonempty segment and retain all native history under a lifetime-new ID.
    /// This is not a durable storage acknowledgement, provider proof or writer lease.
    pub fn seal_history_segment(
        &mut self,
        observed: &RichSharedObservation,
        next_generation: String,
    ) -> Result<(), JsValue> {
        self.inner.seal_history_segment_guarded(&observed.inner, next_generation).map_err(error)
    }
}

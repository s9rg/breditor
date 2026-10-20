//! Seal-observer-history-segment/v1 is separate from writable native generation sealing.
use super::super::{RichReplicaProbe, RichSharedObservation, error};
use wasm_bindgen::prelude::*;
#[cfg_attr(feature = "research", wasm_bindgen)]
#[cfg_attr(not(feature="research"),wasm_bindgen(js_class=SharedEditorOwner))]
impl RichReplicaProbe {
    /// Separate optional capability; never changes the original segmented-history version.
    #[allow(clippy::unused_self)]
    pub fn observer_history_sealing_version(&self) -> String {
        "1".into()
    }
    /// Archive received history only when this live read-only owner has authored no atoms.
    /// This changes neither editing policy nor any relay permission or acknowledgement.
    pub fn seal_observer_history_segment(
        &mut self,
        observed: &RichSharedObservation,
        next_generation: String,
    ) -> Result<(), JsValue> {
        self.inner
            .seal_observer_history_segment_guarded(&observed.inner, next_generation)
            .map_err(error)
    }
}

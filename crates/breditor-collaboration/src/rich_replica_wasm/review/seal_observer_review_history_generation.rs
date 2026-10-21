//! Explicit composite-guard boundary; native code owns files, counters and review history.
use super::{RichReplicaProbe, RichSharedObservation, error};
use wasm_bindgen::prelude::*;
#[cfg_attr(feature = "research", wasm_bindgen)]
#[cfg_attr(not(feature = "research"), wasm_bindgen(js_class = SharedEditorOwner))]
impl RichReplicaProbe {
    /// Seal received observer comments while retaining read-only and zero authored prefix.
    pub fn seal_observer_review_history_generation(
        &mut self,
        observed: &RichSharedObservation,
        next: String,
    ) -> Result<(), JsValue> {
        let token = self.check_review(observed)?.clone();
        self.inner
            .seal_observer_review_history_generation_guarded(
                &observed.inner,
                self.review.as_mut().ok_or_else(|| error("review unavailable"))?,
                &token,
                next,
            )
            .map_err(error)
    }
}

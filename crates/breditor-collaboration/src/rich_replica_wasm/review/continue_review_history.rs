//! Explicit composite-guard boundary; native code owns files, counters and review history.
use super::{RichReplicaProbe, RichSharedObservation, error};
use wasm_bindgen::prelude::*;
#[cfg_attr(feature = "research", wasm_bindgen)]
#[cfg_attr(not(feature = "research"), wasm_bindgen(js_class = SharedEditorOwner))]
impl RichReplicaProbe {
    /// Continue the V1 author comment archive with exact native history.
    pub fn continue_review_history(
        &mut self,
        observed: &RichSharedObservation,
        next: String,
    ) -> Result<(), JsValue> {
        let token = self.check_review(observed)?.clone();
        self.inner
            .continue_review_history_guarded(
                &observed.inner,
                self.review.as_mut().ok_or_else(|| error("review unavailable"))?,
                &token,
                next,
            )
            .map_err(error)
    }
}

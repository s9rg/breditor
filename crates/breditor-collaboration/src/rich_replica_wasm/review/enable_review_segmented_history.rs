//! Explicit composite-guard boundary; native code owns files, counters and review history.
use super::{RichReplicaProbe, RichSharedObservation, error};
use wasm_bindgen::prelude::*;
#[cfg_attr(feature = "research", wasm_bindgen)]
#[cfg_attr(not(feature = "research"), wasm_bindgen(js_class = SharedEditorOwner))]
impl RichReplicaProbe {
    /// Select independent native comment retention without changing the document.
    pub fn enable_review_history_generations(
        &mut self,
        observed: &RichSharedObservation,
        root: String,
        active: String,
    ) -> Result<(), JsValue> {
        let token = self.check_review(observed)?.clone();
        self.inner
            .enable_review_segmented_history_guarded(
                &observed.inner,
                self.review.as_mut().ok_or_else(|| error("review unavailable"))?,
                &token,
                root,
                active,
            )
            .map_err(error)
    }
}

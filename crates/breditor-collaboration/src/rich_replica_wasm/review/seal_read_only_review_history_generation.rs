//! Passive comment seal with actual document and metadata guards; no event or grant is authored.
use super::{RichReplicaProbe, RichSharedObservation, error};
use wasm_bindgen::prelude::*;
#[cfg_attr(feature = "research", wasm_bindgen)]
#[cfg_attr(not(feature = "research"),wasm_bindgen(js_class=SharedEditorOwner))]
impl RichReplicaProbe {
    /// Retain a nonempty suffix under current read-only without resetting a former author.
    pub fn seal_read_only_review_history_generation(
        &mut self,
        observed: &RichSharedObservation,
        next: String,
    ) -> Result<(), JsValue> {
        let token = self.check_review(observed)?.clone();
        self.inner
            .seal_read_only_review_history_generation_guarded(
                &observed.inner,
                self.review.as_mut().ok_or_else(|| error("review unavailable"))?,
                &token,
                next,
            )
            .map_err(error)
    }
}

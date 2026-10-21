//! Separate passive comment archival; current read-only is never temporarily unlocked.
use super::{RichReplicaProbe, RichSharedObservation, error};
use wasm_bindgen::prelude::*;
#[cfg_attr(feature = "research", wasm_bindgen)]
#[cfg_attr(not(feature = "research"),wasm_bindgen(js_class=SharedEditorOwner))]
impl RichReplicaProbe {
    /// Discover passive comment archive boundaries for real former-author histories.
    #[allow(clippy::unused_self)]
    pub fn read_only_review_history_lifecycle_version(&self) -> String {
        "1".into()
    }
    /// Retain the exact original comment root under current read-only and both actual native guards.
    pub fn enable_read_only_review_history_generations(
        &mut self,
        observed: &RichSharedObservation,
        root: String,
        active: String,
    ) -> Result<(), JsValue> {
        let token = self.check_review(observed)?.clone();
        self.inner
            .enable_read_only_review_segmented_history_guarded(
                &observed.inner,
                self.review.as_mut().ok_or_else(|| error("review unavailable"))?,
                &token,
                root,
                active,
            )
            .map_err(error)
    }
}

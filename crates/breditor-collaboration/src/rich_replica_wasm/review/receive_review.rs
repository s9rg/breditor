//! Remote source policy is a separate host argument, never inferred from serialized event claims.
use super::{RichReplicaProbe, RichSharedObservation, error, policy};
use wasm_bindgen::prelude::*;
#[cfg_attr(feature = "research", wasm_bindgen)]
#[cfg_attr(not(feature="research"),wasm_bindgen(js_class=SharedEditorOwner))]
impl RichReplicaProbe {
    /// Atomically receive authenticated metadata; missing event dependencies are not acknowledged.
    pub fn receive_review(
        &mut self,
        observed: &RichSharedObservation,
        verified_policy: &str,
        frame: &str,
    ) -> Result<String, JsValue> {
        let token = self.check_review(observed)?.clone();
        let outcome = self
            .inner
            .receive_review_guarded(
                &observed.inner,
                self.review.as_mut().ok_or_else(|| error("review unavailable"))?,
                &token,
                &policy(verified_policy)?,
                frame,
            )
            .map_err(error)?;
        serde_json::to_string(&outcome).map_err(error)
    }
}

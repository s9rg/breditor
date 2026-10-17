//! Thin closed action transfer; Rust retains all comment policy, merging and history ownership.
use super::{RichReplicaProbe, RichSharedObservation, decode, error};
use wasm_bindgen::prelude::*;
#[cfg_attr(feature = "research", wasm_bindgen)]
#[cfg_attr(not(feature="research"),wasm_bindgen(js_class=SharedEditorOwner))]
impl RichReplicaProbe {
    /// Commit one separately named native comment action against both exact observations.
    pub fn dispatch_review(
        &mut self,
        observed: &RichSharedObservation,
        input: &str,
    ) -> Result<String, JsValue> {
        let token = self.check_review(observed)?.clone();
        let action = decode(input, 512 * 1024)?;
        let outcome = self
            .inner
            .dispatch_review_guarded(
                &observed.inner,
                self.review.as_mut().ok_or_else(|| error("review unavailable"))?,
                &token,
                action,
            )
            .map_err(error)?;
        serde_json::to_string(&outcome).map_err(error)
    }
}

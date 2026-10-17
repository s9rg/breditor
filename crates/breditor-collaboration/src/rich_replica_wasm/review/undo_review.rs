//! Comment Undo cannot undo document typing or retract a peer's contribution.
use super::{RichReplicaProbe, RichSharedObservation, error};
use wasm_bindgen::prelude::*;
#[cfg_attr(feature = "research", wasm_bindgen)]
#[cfg_attr(not(feature="research"),wasm_bindgen(js_class=SharedEditorOwner))]
impl RichReplicaProbe {
    /// Author one contribution-visibility operation under the separate live comment permission.
    pub fn undo_review(&mut self, observed: &RichSharedObservation) -> Result<String, JsValue> {
        let token = self.check_review(observed)?.clone();
        serde_json::to_string(
            &self
                .inner
                .undo_review_guarded(
                    &observed.inner,
                    self.review.as_mut().ok_or_else(|| error("review unavailable"))?,
                    &token,
                )
                .map_err(error)?,
        )
        .map_err(error)
    }
}

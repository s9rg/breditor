//! Comment Redo preserves the original causal priority instead of overwriting newer peer replies.
use super::{RichReplicaProbe, RichSharedObservation, error};
use wasm_bindgen::prelude::*;
#[cfg_attr(feature = "research", wasm_bindgen)]
#[cfg_attr(not(feature="research"),wasm_bindgen(js_class=SharedEditorOwner))]
impl RichReplicaProbe {
    /// Re-enable the next original local review contribution without touching accepted content.
    pub fn redo_review(&mut self, observed: &RichSharedObservation) -> Result<String, JsValue> {
        let token = self.check_review(observed)?.clone();
        serde_json::to_string(
            &self
                .inner
                .redo_review_guarded(
                    &observed.inner,
                    self.review.as_mut().ok_or_else(|| error("review unavailable"))?,
                    &token,
                )
                .map_err(error)?,
        )
        .map_err(error)
    }
}

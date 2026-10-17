//! Browser consumers receive a native attributed projection with real-engine target resolutions.
use super::{RichReplicaProbe, RichSharedObservation, error};
use wasm_bindgen::prelude::*;
#[cfg_attr(feature = "research", wasm_bindgen)]
#[cfg_attr(not(feature="research"),wasm_bindgen(js_class=SharedEditorOwner))]
impl RichReplicaProbe {
    /// Read comment text as plain content; the host must not turn it into unchecked HTML.
    pub fn review_view_json(&self, observed: &RichSharedObservation) -> Result<String, JsValue> {
        self.check_review(observed)?;
        serde_json::to_string(
            &self
                .inner
                .review_view_guarded(
                    &observed.inner,
                    self.review.as_ref().ok_or_else(|| error("review unavailable"))?,
                )
                .map_err(error)?,
        )
        .map_err(error)
    }
}

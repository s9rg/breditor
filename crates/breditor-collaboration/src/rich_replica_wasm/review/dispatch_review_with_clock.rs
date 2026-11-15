//! Predict and commit an ordinary native comment under a previously retained exact prefix.
use super::{RichReplicaProbe, RichSharedObservation, decode, error};
use breditor_core::rich_content::review::{ReviewWriterClock, actions::ReviewAction};
use serde::Deserialize;
use wasm_bindgen::prelude::*;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct CommitRequest {
    action: ReviewAction,
    expected: ReviewWriterClock,
}

#[cfg_attr(feature = "research", wasm_bindgen)]
#[cfg_attr(not(feature="research"),wasm_bindgen(js_class=SharedEditorOwner))]
impl RichReplicaProbe {
    /// Optional exact local review intent capability.
    #[must_use]
    pub fn review_action_clock_version(&self) -> String {
        "1".into()
    }

    /// Pure native staging, including the live validated target and the actual event dependencies.
    pub fn preview_review_action_clock(
        &self,
        observed: &RichSharedObservation,
        input: &str,
    ) -> Result<String, JsValue> {
        let token = self.check_review(observed)?;
        let clock = self
            .inner
            .preview_review_action_clock_guarded(
                &observed.inner,
                self.review.as_ref().ok_or_else(|| error("review unavailable"))?,
                token,
                decode(input, 512 * 1024)?,
            )
            .map_err(error)?;
        serde_json::to_string(&clock).map_err(error)
    }

    /// Check the entire staged event before publishing the original native action.
    pub fn dispatch_review_with_clock(
        &mut self,
        observed: &RichSharedObservation,
        input: &str,
    ) -> Result<String, JsValue> {
        let token = self.check_review(observed)?.clone();
        let request: CommitRequest = decode(input, 512 * 1024)?;
        let outcome = self
            .inner
            .dispatch_review_with_clock_guarded(
                &observed.inner,
                self.review.as_mut().ok_or_else(|| error("review unavailable"))?,
                &token,
                request.action,
                &request.expected,
            )
            .map_err(error)?;
        serde_json::to_string(&outcome).map_err(error)
    }
}

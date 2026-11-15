//! Expose an attributed history page from the actual native review owner.
use super::{RichReplicaProbe, RichSharedObservation, decode, error};
use breditor_core::rich_content::review::ReviewThreadId;
use serde::Deserialize;
use wasm_bindgen::prelude::*;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct HistoryRequest {
    thread: ReviewThreadId,
    offset: u32,
}

#[cfg_attr(feature = "research", wasm_bindgen)]
#[cfg_attr(not(feature="research"),wasm_bindgen(js_class=SharedEditorOwner))]
impl RichReplicaProbe {
    /// Original per-thread archive history projection.
    #[must_use]
    pub fn review_thread_history_version(&self) -> String {
        "1".into()
    }

    /// Read exactly one bounded page at the supplied native observation.
    pub fn read_review_thread_history(
        &self,
        observed: &RichSharedObservation,
        input: &str,
    ) -> Result<String, JsValue> {
        let token = self.check_review(observed)?;
        let request: HistoryRequest = decode(input, 2048)?;
        let page = self
            .review
            .as_ref()
            .ok_or_else(|| error("review unavailable"))?
            .read_thread_history(token, &request.thread, request.offset)
            .map_err(error)?;
        serde_json::to_string(&page).map_err(error)
    }
}

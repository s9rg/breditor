//! Canonical proof for an already-retained source batch; this cannot acknowledge server durability.
use super::{RichReplicaProbe, RichSharedObservation, error, policy};
use wasm_bindgen::prelude::*;
#[cfg_attr(feature = "research", wasm_bindgen)]
#[cfg_attr(not(feature = "research"), wasm_bindgen(js_class = SharedEditorOwner))]
impl RichReplicaProbe {
    /// Compare authenticated relay receipts with Rust's exact retained events, not JavaScript hashes.
    pub fn retained_review_receipt(
        &self,
        observed: &RichSharedObservation,
        host_policy: &str,
        frame: &str,
    ) -> Result<String, JsValue> {
        let token = self.check_review(observed)?;
        let source = policy(host_policy)?;
        let review = self.review.as_ref().ok_or_else(|| error("review unavailable"))?;
        serde_json::to_string(&review.retained_batch_receipt(token, &source, frame).map_err(error)?)
            .map_err(error)
    }
}

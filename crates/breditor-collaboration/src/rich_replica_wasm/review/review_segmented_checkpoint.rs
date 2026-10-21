//! New-family native checkpoint access, not an alias for the original getter.
use super::{RichReplicaProbe, RichSharedObservation, error};
use wasm_bindgen::prelude::*;
#[cfg_attr(feature = "research", wasm_bindgen)]
#[cfg_attr(not(feature = "research"), wasm_bindgen(js_class = SharedEditorOwner))]
impl RichReplicaProbe {
    /// Discover only the separately named native comment-generation capability.
    #[allow(clippy::unused_self)]
    pub fn review_history_generation_version(&self) -> String {
        "1".into()
    }
    /// Read this actual native lane's selected family without inferring it from document/transport.
    pub fn review_history_family(&self) -> String {
        self.review
            .as_ref()
            .map_or("none", |review| {
                if review.has_segmented_history() { "segmented-v1" } else { "original" }
            })
            .into()
    }
    /// Retain original root, immutable files, active suffix and exact future native review history.
    pub fn review_segmented_checkpoint(
        &self,
        observed: &RichSharedObservation,
    ) -> Result<String, JsValue> {
        self.check_review(observed)?;
        self.review
            .as_ref()
            .ok_or_else(|| error("review unavailable"))?
            .segmented_checkpoint_json()
            .map_err(error)
    }
}

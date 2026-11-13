//! Read the explicit continued native comment archive.
use super::{RichReplicaProbe, RichSharedObservation, error};
use wasm_bindgen::prelude::*;
#[cfg_attr(feature = "research", wasm_bindgen)]
#[cfg_attr(not(feature = "research"), wasm_bindgen(js_class = SharedEditorOwner))]
impl RichReplicaProbe {
    /// Discover the explicit comment continuation contract.
    #[allow(clippy::unused_self)]
    pub fn continued_review_history_version(&self) -> String {
        "1".into()
    }

    /// Read the exact continued archive with the current composite observation.
    pub fn review_continued_checkpoint(
        &self,
        observed: &RichSharedObservation,
    ) -> Result<String, JsValue> {
        self.check_review(observed)?;
        self.review
            .as_ref()
            .ok_or_else(|| error("review unavailable"))?
            .continued_checkpoint_json()
            .map_err(error)
    }
}

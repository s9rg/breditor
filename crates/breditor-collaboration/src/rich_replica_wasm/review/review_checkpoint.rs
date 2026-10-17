//! Separate exact comment recovery, never a widened original document checkpoint.
use super::{RichReplicaProbe, RichSharedObservation, error};
use wasm_bindgen::prelude::*;
#[cfg_attr(feature = "research", wasm_bindgen)]
#[cfg_attr(not(feature="research"),wasm_bindgen(js_class=SharedEditorOwner))]
impl RichReplicaProbe {
    /// Persist comments and their independent exact future Undo/Redo partition, without live roles.
    pub fn review_checkpoint(&self, observed: &RichSharedObservation) -> Result<String, JsValue> {
        self.check_review(observed)?;
        self.review
            .as_ref()
            .ok_or_else(|| error("review unavailable"))?
            .checkpoint_json()
            .map_err(error)
    }
}

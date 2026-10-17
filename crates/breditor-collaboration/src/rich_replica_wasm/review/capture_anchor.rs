//! Capture an explicit pure target; current editor selection and document history remain unchanged.
use super::{RichReplicaProbe, RichSharedObservation, decode, error};
use wasm_bindgen::prelude::*;
#[cfg_attr(feature = "research", wasm_bindgen)]
#[cfg_attr(not(feature="research"),wasm_bindgen(js_class=SharedEditorOwner))]
impl RichReplicaProbe {
    /// Capture a bounded closed document/text/node/grid durable review target.
    pub fn capture_review_anchor(
        &self,
        observed: &RichSharedObservation,
        target: &str,
    ) -> Result<String, JsValue> {
        self.inner.check(&observed.inner).map_err(error)?;
        self.inner
            .capture_review_anchor_guarded(&observed.inner, &decode(target, 64 * 1024)?)
            .map_err(error)
    }
    /// Pure strict resolution, including pending/orphaned outcomes, never caret fallback.
    pub fn resolve_review_anchor(&self, packet: &str) -> Result<String, JsValue> {
        serde_json::to_string(&self.inner.resolve_review_anchor(packet).map_err(error)?)
            .map_err(error)
    }
}

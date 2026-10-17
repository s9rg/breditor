//! Additive historical quote capability; original review frame/view families stay closed.
use super::{RichReplicaProbe, error};
use wasm_bindgen::prelude::*;
#[cfg_attr(feature = "research", wasm_bindgen)]
#[cfg_attr(not(feature="research"),wasm_bindgen(js_class=SharedEditorOwner))]
impl RichReplicaProbe {
    /// Complete additive historical quote capability, not a change to review V1 packet meaning.
    #[must_use]
    #[allow(clippy::unused_self)] // Capability is intentionally queried on a live generated owner.
    pub fn review_quote_version(&self) -> String {
        "1".into()
    }
    /// Read original native text even if the current target is orphaned, without publication.
    pub fn read_review_quote(&self, input: &str) -> Result<String, JsValue> {
        serde_json::to_string(&self.inner.read_review_quote(input).map_err(error)?).map_err(error)
    }
}

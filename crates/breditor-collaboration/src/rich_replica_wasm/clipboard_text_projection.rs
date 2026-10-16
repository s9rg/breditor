//! Additive explicit native caption/code text projection and loss report.
use super::{RichReplicaProbe, RichSharedObservation, error};
use wasm_bindgen::prelude::*;
#[cfg_attr(feature = "research", wasm_bindgen)]
#[cfg_attr(not(feature="research"),wasm_bindgen(js_class=SharedEditorOwner))]
impl RichReplicaProbe {
    /// String1 declares observation-guarded conversion; original rich paste never silently retries.
    #[allow(clippy::unused_self)]
    pub fn clipboard_text_policy_version(&self) -> String {
        "1".to_owned()
    }
    /// Read native text/losses for the closed request, or JSON null for a structured prose target.
    pub fn project_clipboard_text(
        &self,
        observation: &RichSharedObservation,
        input: &str,
    ) -> Result<String, JsValue> {
        serde_json::to_string(
            &self.inner.project_clipboard_text_guarded(&observation.inner, input).map_err(error)?,
        )
        .map_err(error)
    }
}

//! Guarded native selection coverage, state and original-annotation authoring.
mod change_selection_formats;
use super::{RichReplicaProbe, RichSharedObservation, error};
use wasm_bindgen::prelude::*;
#[cfg_attr(feature = "research", wasm_bindgen)]
#[cfg_attr(not(feature="research"),wasm_bindgen(js_class=SharedEditorOwner))]
impl RichReplicaProbe {
    /// String1 advertises distinct coverage/state reads and source-derived formatting.
    #[allow(clippy::unused_self)]
    #[must_use]
    pub fn selection_formatting_version(&self) -> String {
        "1".to_owned()
    }
    /// Read selection or document coverage after the exact opaque guard, without publication.
    pub fn selection_coverage_json(
        &self,
        observation: &RichSharedObservation,
        scope: &str,
    ) -> Result<String, JsValue> {
        self.inner.selection_coverage_json_guarded(&observation.inner, scope).map_err(error)
    }
    /// The original inline-state contract is not widened; this has its own read family.
    pub fn selection_format_state_json(
        &self,
        observation: &RichSharedObservation,
        kind: &str,
    ) -> Result<String, JsValue> {
        self.inner.selection_format_state_json_guarded(&observation.inner, kind).map_err(error)
    }
}

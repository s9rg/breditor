//! Optional native writing metadata, separate from every persisted/view family.
use super::{RichReplicaProbe, RichSharedObservation, error};
use wasm_bindgen::prelude::*;

#[cfg_attr(feature = "research", wasm_bindgen)]
#[cfg_attr(not(feature="research"),wasm_bindgen(js_class=SharedEditorOwner))]
impl RichReplicaProbe {
    /// String revision one requires the complete guarded native writing read.
    #[allow(clippy::unused_self)]
    pub fn writing_tools_version(&self) -> String {
        "1".into()
    }
    /// Read current accepted content without changing causal state, UI or retained history.
    pub fn writing_tools_json(&self, observed: &RichSharedObservation) -> Result<String, JsValue> {
        self.inner.writing_tools_json_guarded(&observed.inner).map_err(error)
    }
}

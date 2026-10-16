//! Explicit general-flow clipboard capability, independent of old flow and inline paste commands.
use super::{RichReplicaProbe, RichSharedObservation, error};
use wasm_bindgen::prelude::*;
#[cfg_attr(feature = "research", wasm_bindgen)]
#[cfg_attr(not(feature="research"),wasm_bindgen(js_class=SharedEditorOwner))]
impl RichReplicaProbe {
    /// String1 supports one atomic general-range rich-flow paste into retained prose.
    #[allow(clippy::unused_self)]
    pub fn general_flow_paste_version(&self) -> String {
        "1".to_owned()
    }
    /// Native decode, re-key, general coverage deletion, suffix routing and rich insertion.
    pub fn paste_general_flow_clipboard(
        &mut self,
        observation: &RichSharedObservation,
        input: &str,
    ) -> Result<bool, JsValue> {
        self.inner
            .paste_general_flow_clipboard_namespace_json_guarded(&observation.inner, input)
            .map_err(error)
    }
}

//! Additive native clipboard-paste capability; original paste commands keep their meaning.
use super::{RichReplicaProbe, RichSharedObservation, error};
use wasm_bindgen::prelude::*;
#[cfg_attr(feature = "research", wasm_bindgen)]
#[cfg_attr(not(feature="research"),wasm_bindgen(js_class=SharedEditorOwner))]
impl RichReplicaProbe {
    /// String1 supports strict native inline clipboard paste at an explicit general target.
    #[allow(clippy::unused_self)]
    pub fn general_inline_paste_version(&self) -> String {
        "1".to_owned()
    }
    /// Decode the closed clipboard request and publish one exact native general edit.
    pub fn paste_general_inline_clipboard(
        &mut self,
        observation: &RichSharedObservation,
        input: &str,
    ) -> Result<bool, JsValue> {
        self.inner
            .paste_general_inline_clipboard_namespace_json_guarded(&observation.inner, input)
            .map_err(error)
    }
}

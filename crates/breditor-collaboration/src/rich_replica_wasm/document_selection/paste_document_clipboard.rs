//! Thin closed boundary; native Core owns re-keying and shared lowering owns selective history.
use super::super::{RichReplicaProbe, RichSharedObservation, error};
use wasm_bindgen::prelude::*;

#[cfg_attr(feature = "research", wasm_bindgen)]
#[cfg_attr(not(feature = "research"), wasm_bindgen(js_class = SharedEditorOwner))]
impl RichReplicaProbe {
    /// String1 declares native whole-document rich paste, independent from prior scope support.
    #[allow(clippy::unused_self)]
    pub fn document_clipboard_version(&self) -> String {
        "1".into()
    }

    /// Paste native text/flow/grid once with a permanently consumed fresh host namespace.
    pub fn paste_document_clipboard(
        &mut self,
        observation: &RichSharedObservation,
        input: &str,
    ) -> Result<bool, JsValue> {
        self.inner
            .paste_document_clipboard_namespace_json_guarded(&observation.inner, input)
            .map_err(error)
    }
}

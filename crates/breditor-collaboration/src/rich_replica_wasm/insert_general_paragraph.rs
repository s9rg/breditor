//! Explicit native general paragraph capability, separate from original Enter and range commands.
use super::{RichReplicaProbe, RichSharedObservation, error};
use wasm_bindgen::prelude::*;
#[cfg_attr(feature = "research", wasm_bindgen)]
#[cfg_attr(not(feature="research"),wasm_bindgen(js_class=SharedEditorOwner))]
impl RichReplicaProbe {
    /// String1 supports native paragraph/list/task Enter over general prose ranges.
    #[allow(clippy::unused_self)]
    pub fn general_paragraph_version(&self) -> String {
        "1".to_owned()
    }
    /// Publish one closed native general paragraph edit with exact selective history.
    pub fn insert_general_paragraph(
        &mut self,
        observation: &RichSharedObservation,
        input: &str,
    ) -> Result<bool, JsValue> {
        self.inner
            .insert_general_paragraph_namespace_json_guarded(&observation.inner, input)
            .map_err(error)
    }
}

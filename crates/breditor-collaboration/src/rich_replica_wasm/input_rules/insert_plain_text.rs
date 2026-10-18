//! Strict local caret input and one optional independently undoable native shortcut.
use super::super::{RichReplicaProbe, RichSharedObservation, error};
use serde::Deserialize;
use wasm_bindgen::prelude::*;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Input {
    text: String,
    namespace: String,
}
#[cfg_attr(feature = "research", wasm_bindgen)]
#[cfg_attr(not(feature = "research"), wasm_bindgen(js_class = SharedEditorOwner))]
impl RichReplicaProbe {
    /// An accepted-input refusal returns "refused", never an error or partial conversion.
    pub fn insert_plain_text_with_markdown_rules(
        &mut self,
        observed: &RichSharedObservation,
        input: &str,
    ) -> Result<String, JsValue> {
        let value: Input = self.decode_input_rule(observed, input).map_err(error)?;
        self.inner
            .insert_plain_text_with_markdown_rules_guarded(
                &observed.inner,
                &value.text,
                &value.namespace,
            )
            .map(|value| value.as_str().into())
            .map_err(error)
    }
}

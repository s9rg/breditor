//! Grouped user input and native rule planning before any SDK callback can run.
use super::super::{RichReplicaProbe, RichSharedObservation, error};
use serde::Deserialize;
use wasm_bindgen::prelude::*;

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct Input {
    text: String,
    namespace: String,
    #[serde(deserialize_with = "super::super::typing::clock")]
    clock_ms: u64,
}
#[cfg_attr(feature = "research", wasm_bindgen)]
#[cfg_attr(not(feature = "research"), wasm_bindgen(js_class = SharedEditorOwner))]
impl RichReplicaProbe {
    /// A matching conversion is isolated from the typed burst; refusal retains input.
    pub fn insert_typing_text_with_markdown_rules(
        &mut self,
        observed: &RichSharedObservation,
        input: &str,
    ) -> Result<String, JsValue> {
        let value: Input = self.decode_input_rule(observed, input).map_err(error)?;
        self.inner
            .insert_typing_text_with_markdown_rules_guarded(
                &observed.inner,
                &value.text,
                value.clock_ms,
                &value.namespace,
            )
            .map(|value| value.as_str().into())
            .map_err(error)
    }
}

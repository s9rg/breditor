//! Natural user input and isolated rule conversion within one exclusive call.
use super::super::{BreditorRichEditor, BreditorRichObservation, error, selection::decimal};
use crate::BreditorStringResult;
use serde::Deserialize;
use wasm_bindgen::prelude::wasm_bindgen;

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct Input {
    text: String,
    namespace: String,
    #[serde(deserialize_with = "decimal")]
    clock_ms: u64,
}
#[wasm_bindgen]
impl BreditorRichEditor {
    /// Return a payload-free outcome; never retry input when a rule was refused.
    #[must_use]
    #[wasm_bindgen(js_name=insertTypingTextWithMarkdownRules)]
    pub fn insert_typing_text_with_markdown_rules(
        &mut self,
        observed: &BreditorRichObservation,
        input: &str,
    ) -> BreditorStringResult {
        let result = (|| {
            let value: Input = self.decode_input_rule(observed, input)?;
            self.inner
                .insert_typing_text_with_markdown_rules(
                    &observed.inner,
                    &value.text,
                    value.clock_ms,
                    &value.namespace,
                )
                .map_err(|e| error::session(&e))
        })();
        match result {
            Ok(value) => BreditorStringResult::from_value(value.as_str().into()),
            Err(e) => BreditorStringResult::from_error(e),
        }
    }
}

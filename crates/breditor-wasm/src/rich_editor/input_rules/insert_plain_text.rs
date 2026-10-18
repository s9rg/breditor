//! Literal caret input plus one optional native rule before any host publication.
use super::super::{BreditorRichEditor, BreditorRichObservation, error};
use crate::BreditorStringResult;
use serde::Deserialize;
use wasm_bindgen::prelude::wasm_bindgen;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Input {
    text: String,
    namespace: String,
}
#[wasm_bindgen]
impl BreditorRichEditor {
    /// Return unchanged/inserted/applied/refused. Refused retains literal input.
    #[must_use]
    #[wasm_bindgen(js_name=insertPlainTextWithMarkdownRules)]
    pub fn insert_plain_text_with_markdown_rules(
        &mut self,
        observed: &BreditorRichObservation,
        input: &str,
    ) -> BreditorStringResult {
        let result = (|| {
            let value: Input = self.decode_input_rule(observed, input)?;
            self.inner
                .insert_plain_text_with_markdown_rules(
                    &observed.inner,
                    &value.text,
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

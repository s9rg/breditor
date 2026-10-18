//! Optional exclusive typing-plus-rule calls; old execute JSON remains closed.
mod insert_plain_text;
mod insert_typing_text;
use super::{BreditorRichEditor, BreditorRichObservation, error};
use crate::BreditorError;
use serde::Deserialize;
use wasm_bindgen::prelude::wasm_bindgen;

impl BreditorRichEditor {
    fn decode_input_rule<'a, T: Deserialize<'a>>(
        &self,
        observed: &BreditorRichObservation,
        input: &'a str,
    ) -> Result<T, BreditorError> {
        self.inner.check_observation(&observed.inner).map_err(|e| error::session(&e))?;
        if self.inner.is_read_only() {
            return Err(error::rejected("breditor_rich.read_only"));
        }
        if input.len() > 512 * 1024 {
            return Err(error::rejected("breditor_rich.input_rule_request"));
        }
        serde_json::from_str(input).map_err(|_| error::rejected("breditor_rich.input_rule_request"))
    }
}
#[wasm_bindgen]
impl BreditorRichEditor {
    /// String1 requires both named calls and payload-free four-state outcomes.
    #[must_use]
    #[allow(clippy::unused_self)]
    #[wasm_bindgen(js_name=markdownInputRulesVersion)]
    pub fn markdown_input_rules_version(&self) -> String {
        "1".into()
    }
    /// String1 selects the current source-guarded browser adapter, not a saved policy.
    #[must_use]
    #[allow(clippy::unused_self)]
    #[wasm_bindgen(js_name=markdownInputRoutingVersion)]
    pub fn markdown_input_routing_version(&self) -> String {
        "1".into()
    }
}

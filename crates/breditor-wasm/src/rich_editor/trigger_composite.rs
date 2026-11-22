//! Native slash-command composite capability; the operation is the `replaceTriggerThen` command.
use super::BreditorRichEditor;
use wasm_bindgen::prelude::*;
#[wasm_bindgen]
impl BreditorRichEditor {
    /// String1: `replaceTriggerThen` removes one typed trigger range and runs one allowlisted
    /// command as a single native history unit. Every rich owner (V1–V4) supports it; an older
    /// module lacks this method and the browser keeps the two-step path.
    #[must_use]
    #[wasm_bindgen(js_name=triggerCompositeVersion)]
    pub fn trigger_composite_version(&self) -> String {
        "1".into()
    }
    /// String1: `commandGroup` runs 1–64 allowlisted text-range, inline-format and
    /// block-identity commands as a single native history unit (agent tool contract). An
    /// older module lacks this method and hosts apply one command at a time.
    #[must_use]
    #[wasm_bindgen(js_name=commandGroupVersion)]
    pub fn command_group_version(&self) -> String {
        "1".into()
    }
}

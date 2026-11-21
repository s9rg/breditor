//! Native letter-case change capability (`changeSelectionCase`); every rich language.
use super::BreditorRichEditor;
use wasm_bindgen::prelude::*;
#[wasm_bindgen]
impl BreditorRichEditor {
    /// String1 selects the native `changeSelectionCase` command (UPPER, lower,
    /// Title Case and Shift+F3 cycling over the native selection).
    #[must_use]
    #[wasm_bindgen(js_name=caseChangeVersion)]
    pub fn case_change_version(&self) -> String {
        "1".into()
    }
}

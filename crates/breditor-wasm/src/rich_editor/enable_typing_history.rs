//! Additive explicit native history admission; original editor defaults stay unchanged.
use super::{BreditorRichEditor, BreditorRichObservation, error};
use crate::BreditorStringResult;
use wasm_bindgen::prelude::wasm_bindgen;

#[wasm_bindgen]
impl BreditorRichEditor {
    /// Separate native grouping capability; neither rich ABI nor original checkpoint changes.
    #[must_use]
    #[wasm_bindgen(js_name=typingHistoryVersion)]
    pub fn typing_history_version(&self) -> String {
        "1".to_owned()
    }
    /// Enable natural typing history under the exact publication guard.
    /// The selected owner subsequently emits the separate typing-session checkpoint family.
    #[must_use]
    #[wasm_bindgen(js_name=enableTypingHistory)]
    pub fn enable_typing_history(
        &mut self,
        observation: &BreditorRichObservation,
    ) -> BreditorStringResult {
        match self.inner.enable_typing_history(&observation.inner) {
            Ok(changed) => BreditorStringResult::from_value(changed.to_string()),
            Err(value) => BreditorStringResult::from_error(error::session(&value)),
        }
    }
}

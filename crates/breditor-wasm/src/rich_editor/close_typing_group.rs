//! Explicit history-only intent boundary, separate from content-command outcomes.
use super::{BreditorRichEditor, BreditorRichObservation, error};
use crate::BreditorStringResult;
use wasm_bindgen::prelude::wasm_bindgen;

#[wasm_bindgen]
impl BreditorRichEditor {
    /// Close an active typing continuation without editing content or discarding Redo.
    #[must_use]
    #[wasm_bindgen(js_name=closeTypingGroup)]
    pub fn close_typing_group(
        &mut self,
        observation: &BreditorRichObservation,
    ) -> BreditorStringResult {
        match self.inner.close_typing_group(&observation.inner) {
            Ok(changed) => BreditorStringResult::from_value(changed.to_string()),
            Err(value) => BreditorStringResult::from_error(error::session(&value)),
        }
    }
}

//! Explicit guarded native Select All, separate from the original closed selection DTO.
use super::{BreditorRichCommandResult, BreditorRichEditor, BreditorRichObservation, error};
use wasm_bindgen::prelude::*;
#[wasm_bindgen]
impl BreditorRichEditor {
    /// String1 declares native document scope and its separate exact checkpoint/read factories.
    #[allow(clippy::unused_self)]
    #[must_use]
    #[wasm_bindgen(js_name=documentSelectionVersion)]
    pub fn document_selection_version(&self) -> String {
        "1".to_owned()
    }
    /// Select all current root content without a text-endpoint approximation or a content Undo unit.
    /// Original execute/setSelection records remain closed and do not admit this new scope.
    #[must_use]
    #[wasm_bindgen(js_name=selectDocument)]
    pub fn select_document(
        &mut self,
        observation: &BreditorRichObservation,
    ) -> BreditorRichCommandResult {
        match self.inner.select_document(&observation.inner) {
            Ok(outcome) => BreditorRichCommandResult::success(outcome, self.observe()),
            Err(e) => BreditorRichCommandResult::failure(error::session(&e)),
        }
    }
}

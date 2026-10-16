//! Explicit separately-versioned grouped recovery; the original factory remains strict.
use super::{BreditorRichEditor, BreditorRichEditorResult, BreditorRichProfile, error};
use breditor_core::codec::RichTypingSessionJsonCodec;
use wasm_bindgen::prelude::wasm_bindgen;

#[wasm_bindgen]
impl BreditorRichProfile {
    /// Replay-admit the typing-session family and restore a fresh grouped owner.
    /// Active input continuation and host read-only permission are not restored.
    #[must_use]
    #[wasm_bindgen(js_name=restoreTypingEditor)]
    pub fn restore_typing_editor(&self, input: &str) -> BreditorRichEditorResult {
        match RichTypingSessionJsonCodec::new(self.context()).decode(input) {
            Ok(owner) => BreditorRichEditorResult::success(BreditorRichEditor::new(owner)),
            Err(_) => BreditorRichEditorResult::failure(error::rejected(
                "breditor_rich.checkpoint_rejected",
            )),
        }
    }
}

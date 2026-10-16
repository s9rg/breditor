//! Separate document-scope checkpoint reads/restores; no existing checkpoint getter changes family.
use super::{BreditorRichEditor, BreditorRichEditorResult, BreditorRichProfile, error};
use crate::BreditorStringResult;
use breditor_core::codec::{RichDocumentSessionJsonCodec, RichDocumentTypingSessionJsonCodec};
use wasm_bindgen::prelude::*;
#[wasm_bindgen]
impl BreditorRichEditor {
    /// Encode the explicitly selected document-scope explicit/natural family with exact future UI.
    /// This pure read never downgrades, rewrites the owner or authorizes a later command.
    #[must_use]
    #[wasm_bindgen(js_name=documentCheckpointJson)]
    pub fn document_checkpoint_json(&self) -> BreditorStringResult {
        let c = self.inner.context().clone();
        let value = if self.inner.typing_history_enabled() {
            RichDocumentTypingSessionJsonCodec::new(c).encode(&self.inner)
        } else {
            RichDocumentSessionJsonCodec::new(c).encode(&self.inner)
        };
        value.map_or_else(
            |_| {
                BreditorStringResult::from_error(error::rejected(
                    "breditor_rich.document_checkpoint_read",
                ))
            },
            BreditorStringResult::from_value,
        )
    }
}
#[wasm_bindgen]
impl BreditorRichProfile {
    /// String1 declares matching explicit/natural document-scope recovery factories.
    #[allow(clippy::unused_self)]
    #[must_use]
    #[wasm_bindgen(js_name=documentSelectionVersion)]
    pub fn document_selection_version(&self) -> String {
        "1".to_owned()
    }
    /// Restore only the explicitly selected document-scope explicit family, never sniff or downgrade.
    #[must_use]
    #[wasm_bindgen(js_name=restoreDocumentEditor)]
    pub fn restore_document_editor(&self, input: &str) -> BreditorRichEditorResult {
        match RichDocumentSessionJsonCodec::new(self.context()).decode(input) {
            Ok(owner) => BreditorRichEditorResult::success(BreditorRichEditor::new(owner)),
            Err(_) => BreditorRichEditorResult::failure(error::rejected(
                "breditor_rich.document_checkpoint_restore",
            )),
        }
    }
    /// Restore only the document-scope natural family with its complete native typing partition.
    #[must_use]
    #[wasm_bindgen(js_name=restoreDocumentTypingEditor)]
    pub fn restore_document_typing_editor(&self, input: &str) -> BreditorRichEditorResult {
        match RichDocumentTypingSessionJsonCodec::new(self.context()).decode(input) {
            Ok(owner) => BreditorRichEditorResult::success(BreditorRichEditor::new(owner)),
            Err(_) => BreditorRichEditorResult::failure(error::rejected(
                "breditor_rich.document_typing_checkpoint_restore",
            )),
        }
    }
}

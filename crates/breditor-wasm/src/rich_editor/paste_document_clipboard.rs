//! Explicit whole-document rich paste. Parsing/re-keying never precedes observation/write guards.
use super::{BreditorRichCommandResult, BreditorRichEditor, BreditorRichObservation, error};
use crate::BreditorError;
use breditor_core::{
    codec::RichClipboardJsonCodec,
    rich_content::{RichClipboardNamespace, RichLocalOutcome, RichLocalSessionError},
};
use serde::Deserialize;
use wasm_bindgen::prelude::*;

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct Record {
    clipboard_json: String,
    prefix: String,
}

#[wasm_bindgen]
impl BreditorRichEditor {
    /// String1 declares native rich paste over explicit document scope, independently of selection.
    #[allow(clippy::unused_self)]
    #[must_use]
    #[wasm_bindgen(js_name = documentClipboardVersion)]
    pub fn document_clipboard_version(&self) -> String {
        "1".into()
    }

    /// Paste native text/flow/grid in one Undo group. A host-reserved namespace remains consumed
    /// after every attempt, including refusal and Undo. No rich failure falls back to plain text.
    #[must_use]
    #[wasm_bindgen(js_name = pasteDocumentClipboard)]
    pub fn paste_document_clipboard(
        &mut self,
        observation: &BreditorRichObservation,
        input: &str,
    ) -> BreditorRichCommandResult {
        let run = |owner: &mut Self| -> Result<RichLocalOutcome, BreditorError> {
            owner.inner.validate_observation(&observation.inner).map_err(|e| error::session(&e))?;
            if owner.inner.is_read_only() {
                return Err(error::session(&RichLocalSessionError::ReadOnly));
            }
            // An escaped clipboard is independently bounded by its native 1 MiB semantic codec.
            if input.len() > 4 * 1024 * 1024 {
                return Err(error::rejected("breditor_rich.document_clipboard_request_budget"));
            }
            let r: Record = serde_json::from_str(input)
                .map_err(|_| error::rejected("breditor_rich.document_clipboard_request_json"))?;
            let clipboard = RichClipboardJsonCodec::new(observation.context.clone())
                .decode(&r.clipboard_json)
                .map_err(|_| error::rejected("breditor_rich.document_clipboard_admission"))?;
            let mut ids = RichClipboardNamespace::try_new(&r.prefix)
                .map_err(|_| error::rejected("breditor_rich.document_clipboard_namespace"))?;
            owner
                .inner
                .paste_document_clipboard(&observation.inner, &clipboard, &mut ids)
                .map_err(|e| error::session(&e))
        };
        match run(self) {
            Ok(outcome) => BreditorRichCommandResult::success(outcome, self.observe()),
            Err(e) => BreditorRichCommandResult::failure(e),
        }
    }
}

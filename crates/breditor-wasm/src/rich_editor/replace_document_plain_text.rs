//! Closed whole-document plain replacement; guard/write checks precede JSON and target work.
use super::{BreditorRichCommandResult, BreditorRichEditor, BreditorRichObservation, error};
use crate::BreditorError;
use breditor_core::rich_content::{BlockId, RichLocalOutcome, RichLocalSessionError};
use serde::Deserialize;
use wasm_bindgen::prelude::*;
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Record {
    paragraph: String,
    text: String,
}
#[wasm_bindgen]
impl BreditorRichEditor {
    /// Replace an explicit document selection once, using a fresh paragraph and native plain style.
    /// Use documentCheckpointJson for exact recovery; original checkpointJson deliberately refuses
    /// this new scope even when it is retained only in an Undo/Redo before-state.
    #[must_use]
    #[wasm_bindgen(js_name=replaceDocumentPlainText)]
    pub fn replace_document_plain_text(
        &mut self,
        observation: &BreditorRichObservation,
        input: &str,
    ) -> BreditorRichCommandResult {
        let run = |owner: &mut Self| -> Result<RichLocalOutcome, BreditorError> {
            owner.inner.validate_observation(&observation.inner).map_err(|e| error::session(&e))?;
            if owner.inner.is_read_only() {
                return Err(error::session(&RichLocalSessionError::ReadOnly));
            }
            if input.len() > 1024 * 1024 {
                return Err(error::rejected("breditor_rich.document_input_budget"));
            }
            let r: Record = serde_json::from_str(input)
                .map_err(|_| error::rejected("breditor_rich.document_input_json"))?;
            let paragraph = BlockId::try_new(r.paragraph)
                .map_err(|_| error::rejected("breditor_rich.document_input_id"))?;
            owner
                .inner
                .replace_document_plain_text(&observation.inner, &paragraph, &r.text)
                .map_err(|e| error::session(&e))
        };
        match run(self) {
            Ok(outcome) => BreditorRichCommandResult::success(outcome, self.observe()),
            Err(e) => BreditorRichCommandResult::failure(e),
        }
    }
}

//! Separate first-key document replacement with a canonical exact clock and native grouping.
use super::{BreditorRichCommandResult, BreditorRichEditor, BreditorRichObservation, error};
use crate::BreditorError;
use breditor_core::rich_content::{BlockId, RichLocalOutcome, RichLocalSessionError};
use serde::{Deserialize, Deserializer};
use wasm_bindgen::prelude::*;
#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct Record {
    paragraph: String,
    text: String,
    #[serde(deserialize_with = "clock")]
    clock_ms: u64,
}
fn clock<'de, D: Deserializer<'de>>(d: D) -> Result<u64, D::Error> {
    let s = String::deserialize(d)?;
    let n = s.parse::<u64>().map_err(serde::de::Error::custom)?;
    if s.len() > 20 || n.to_string() != s {
        return Err(serde::de::Error::custom("canonical document typing clock"));
    }
    Ok(n)
}
#[wasm_bindgen]
impl BreditorRichEditor {
    /// String1 declares first-key document replacement that may join subsequent native caret input.
    #[allow(clippy::unused_self)]
    #[must_use]
    #[wasm_bindgen(js_name=documentTypingVersion)]
    pub fn document_typing_version(&self) -> String {
        "1".to_owned()
    }
    /// Submit one guarded closed document-typing request, without an intermediate selection edit.
    #[must_use]
    #[wasm_bindgen(js_name=replaceDocumentTypingText)]
    pub fn replace_document_typing_text(
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
                return Err(error::rejected("breditor_rich.document_typing_budget"));
            }
            let r: Record = serde_json::from_str(input)
                .map_err(|_| error::rejected("breditor_rich.document_typing_json"))?;
            let paragraph = BlockId::try_new(r.paragraph)
                .map_err(|_| error::rejected("breditor_rich.document_typing_id"))?;
            owner
                .inner
                .replace_document_typing_text(&observation.inner, &paragraph, &r.text, r.clock_ms)
                .map_err(|e| error::session(&e))
        };
        match run(self) {
            Ok(result) => BreditorRichCommandResult::success(result, self.observe()),
            Err(e) => BreditorRichCommandResult::failure(e),
        }
    }
}

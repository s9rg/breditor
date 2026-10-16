//! First-key document replacement starts one selective native burst, retaining the Document before-UI.
use super::{
    RichReplica, SharedObservation,
    actions::ReplaceDocumentPlainTextV1,
    typing_history::{Kind, Request, separator},
};
use crate::Error;
use serde::Deserialize;
#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct Record {
    paragraph: String,
    text: String,
    #[serde(deserialize_with = "super::general_range_input_json::clock")]
    clock_ms: u64,
}
impl RichReplica {
    /// Replace the explicit whole-document scope with user typing; following caret input may join.
    /// Empty input proves the observed scope and publishes no birth, deletion or history entry.
    /// # Errors
    /// Stale/read-only/wrong mode/scope or disabled history reject before parsing; malformed clock,
    /// text/ID, replay and final admission failures publish nothing.
    pub fn replace_document_typing_text_json_guarded(
        &mut self,
        observation: &SharedObservation,
        input: &str,
    ) -> Result<bool, Error> {
        self.check(observation)?;
        self.require_writable()?;
        if !self.document_selection_enabled()
            || !self.document_selected()
            || !self.typing_history_enabled()
        {
            return Err(Error::Contract("document user typing mode and scope required"));
        }
        let r: Record = super::general_range_input_json::decode(input)?;
        if r.text.is_empty() {
            return Ok(false);
        }
        let request = Request {
            join: false,
            kind: Kind::Insert,
            clock: r.clock_ms,
            formats: vec![],
            isolated: separator(&r.text),
        };
        self.apply_document_plain_action(
            ReplaceDocumentPlainTextV1 { paragraph: r.paragraph, text: r.text },
            Some(request),
        )
    }
}

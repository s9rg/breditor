//! Pure native clipboard conversion under the exact shared observation; read-only is allowed.
use super::{RichReplica, SharedObservation, selection::Selection};
use crate::Error;
use breditor_core::{codec::RichClipboardJsonCodec, rich_content::RichClipboardTextProjection};
use serde::Deserialize;
#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct Record {
    selection: Selection,
    clipboard_json: String,
}
impl RichReplica {
    /// Read the explicit caption/code projection before guarded plain replacement; never a fallback.
    /// # Errors
    /// Stale/foreign observations reject before decoding. Invalid targets, kind, schema and budgets
    /// reject without UI/history changes. A prose target returns no projection.
    pub fn project_clipboard_text_guarded(
        &self,
        observation: &SharedObservation,
        input: &str,
    ) -> Result<Option<RichClipboardTextProjection>, Error> {
        self.check(observation)?;
        if input.len() > 2 * 1024 * 1024 {
            return Err(Error::Limit("clipboard projection input"));
        }
        let r: Record = serde_json::from_str(input).map_err(|_| Error::Json)?;
        let context = super::paragraphs::context(&self.codec);
        let clipboard = RichClipboardJsonCodec::new(context)
            .decode(&r.clipboard_json)
            .map_err(|_| Error::Contract("clipboard projection admission"))?;
        clipboard
            .project_text_for_selection(&self.document, &r.selection.admit(&self.document)?)
            .map_err(|_| Error::Contract("clipboard text projection"))
    }
}

//! Capture and validate one immutable proposed edit without changing accepted content or history.
use super::{
    DocumentSuggestionDraft, evaluate_commands,
    packet::{self, Data, MAX_BYTES, Packet},
};
use crate::{
    Error,
    rich_replica::{ReviewAnchorTarget, RichReplica, SharedObservation},
};
use breditor_core::rich_content::review::ReviewPrincipalId;
impl RichReplica {
    /// Capture a source-proven original intent. Read-only document owners may propose changes;
    /// publication rights, authenticated attribution and later Accept/Reject remain host authority.
    /// The private preview does not alter selection, formats, counters, Undo/Redo or accepted text.
    /// # Errors
    /// Stale/foreign guard, invalid labels/commands/targets, no semantic effect or budgets reject.
    pub fn capture_document_suggestion_guarded(
        &self,
        observed: &SharedObservation,
        title: &str,
        author: ReviewPrincipalId,
        created_at_ms: &str,
        draft: DocumentSuggestionDraft,
    ) -> Result<String, Error> {
        self.check(observed)?;
        packet::label(title, created_at_ms)?;
        if serde_json::to_vec(&draft)?.len() > MAX_BYTES {
            return Err(Error::Limit("document suggestion bytes"));
        }
        let after = evaluate_commands::evaluate(
            self,
            &self.doc,
            &self.document,
            self.document_json(),
            &draft,
        )?;
        if after == self.document_json() {
            return Err(Error::Contract("suggestion has no semantic effect"));
        }
        let data = Data {
            format: "breditor/document-suggestion".into(),
            format_version: 1,
            title: title.into(),
            author,
            created_at_ms: created_at_ms.into(),
            source_anchor_json: self
                .capture_review_anchor_guarded(observed, &ReviewAnchorTarget::Document)?,
            draft,
        };
        let packet = Packet { id: packet::digest(&data)?, data };
        let encoded = serde_json::to_string(&packet)?;
        if encoded.len() > MAX_BYTES {
            return Err(Error::Limit("document suggestion bytes"));
        }
        Ok(encoded)
    }
}

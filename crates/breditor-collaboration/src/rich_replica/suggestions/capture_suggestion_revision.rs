//! Pure author-preserving revision capture; server-ordered supersession is a separate contract.
use super::{
    DocumentSuggestionDraft, DocumentSuggestionSource,
    revision_packet::{Data, MAX_BYTES, Revision, digest},
};
use crate::{
    Error,
    rich_replica::{RichReplica, SharedObservation},
};
impl RichReplica {
    /// Capture a new immutable proposal at the current native source, linked to an exact prior
    /// proposal by the same descriptive author. Read-only owners may prepare revisions. Only the
    /// authenticated host may supersede a still-pending predecessor; no local finality is implied.
    /// Fresh namespaces remain host-owned and consumed after refusal or discarded revisions.
    /// # Errors
    /// Stale/foreign guards, missing original source, invalid/no-op replacement, original packet
    /// limits, changed binding or equal proposal identities reject without changing any live state.
    pub fn capture_document_suggestion_revision_guarded(
        &self,
        observed: &SharedObservation,
        previous: &str,
        title: &str,
        created_at_ms: &str,
        draft: DocumentSuggestionDraft,
    ) -> Result<String, Error> {
        self.check(observed)?;
        let DocumentSuggestionSource::Verified { info, .. } =
            self.verify_document_suggestion_source(previous)?
        else {
            return Err(Error::Contract("suggestion revision requires predecessor source"));
        };
        let child = self.capture_document_suggestion_guarded(
            observed,
            title,
            info.author,
            created_at_ms,
            draft,
        )?;
        let data = Data {
            format: "breditor/document-suggestion-revision".into(),
            format_version: 1,
            previous_suggestion_id: info.id,
            suggestion_packet_json: child,
        };
        let encoded = serde_json::to_string(&Revision { id: digest(&data)?, data })?;
        if encoded.len() > MAX_BYTES {
            return Err(Error::Limit("suggestion revision bytes"));
        }
        if !matches!(
            self.verify_document_suggestion_revision(previous, &encoded)?,
            super::DocumentSuggestionRevisionSource::Verified { .. }
        ) {
            return Err(Error::Contract("suggestion revision source is incomplete"));
        }
        Ok(encoded)
    }
}

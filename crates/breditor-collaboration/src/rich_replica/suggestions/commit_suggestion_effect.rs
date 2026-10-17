//! Publish only the exact previously staged native edit after the host's durable append.
use super::{DocumentSuggestionEffect, PreparedDocumentSuggestionEffect};
use crate::{Error, rich_replica::RichReplica};
impl RichReplica {
    /// Consume a staged effect once, without re-evaluating commands or regenerating writer counters.
    /// The host must already have durably recorded the decision and candidate while holding its
    /// serialization lock. This method itself does not claim disk durability or reviewer authority.
    /// # Errors
    /// A changed source, another owner, or current read-only policy rejects without publication.
    pub fn commit_document_suggestion_effect(
        &mut self,
        prepared: PreparedDocumentSuggestionEffect,
    ) -> Result<DocumentSuggestionEffect, Error> {
        self.check(&prepared.basis)?;
        self.require_writable()?;
        *self = prepared.candidate;
        Ok(prepared.effect)
    }
}

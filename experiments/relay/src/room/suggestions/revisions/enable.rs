//! Explicit activation does not migrate existing proposal journals or grant new account roles.
use super::{RevisionsState, Room, SuggestionRevisionsDescriptor};
use crate::{Error, Result, credentials, log::Event};
impl Room {
    /// Enable immutable author revisions once, separately from the original suggestion lane.
    /// # Errors
    /// Non-owner, missing suggestion lane, invalid activation or persistence failures reject.
    pub fn enable_document_suggestion_revisions(
        &mut self,
        principal: &str,
    ) -> Result<SuggestionRevisionsDescriptor> {
        self.reader(principal)?;
        if principal != self.owner {
            return Err(Error::Permission);
        }
        if self.suggestions_state()?.revisions.is_none() {
            let binding = credentials::issue()?;
            self.log.append(Event::EnableDocumentSuggestionRevisionsV1 {
                actor: principal.into(),
                binding: binding.clone(),
            })?;
            self.suggestions.as_mut().ok_or(Error::NeedsRecovery)?.revisions =
                Some(RevisionsState::new(&binding));
        }
        self.document_suggestion_revisions_descriptor(principal)
    }
    /// Read the explicit revision capability under current document-read permission.
    /// # Errors
    /// Revoked readers, disabled lanes and uncertain storage reject.
    pub fn document_suggestion_revisions_descriptor(
        &self,
        principal: &str,
    ) -> Result<SuggestionRevisionsDescriptor> {
        self.reader(principal)?;
        let state = self.suggestions_state()?;
        let revisions = state
            .revisions
            .as_ref()
            .ok_or(Error::Contract("suggestion revisions V1 not enabled"))?;
        Ok(SuggestionRevisionsDescriptor {
            format: "breditor/relay-suggestion-revisions",
            format_version: 1,
            document: self.replica.document_id().into(),
            binding: revisions.binding.clone(),
            suggestion_binding: state.binding.clone(),
        })
    }
}

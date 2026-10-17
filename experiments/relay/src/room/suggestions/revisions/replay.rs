//! A complete Prepare without its immediately following Commit is validated but inert.
use super::{RevisionsState, Room, prepare::RevisionPreparation};
use crate::{Error, Result, credentials, log::Event};
impl Room {
    pub(in crate::room::suggestions) fn replay_suggestion_revision(
        &mut self,
        sequence: u64,
        event: Event,
    ) -> Result<()> {
        match event {
            Event::EnableDocumentSuggestionRevisionsV1 { actor, binding } => {
                if actor != self.owner || self.suggestions_state()?.revisions.is_some() {
                    return Err(Error::Contract("revision activation lineage"));
                }
                self.reader(&actor)?;
                credentials::hash(&binding)?;
                self.suggestions.as_mut().ok_or(Error::NeedsRecovery)?.revisions =
                    Some(RevisionsState::new(&binding, sequence));
            }
            Event::PrepareDocumentSuggestionRevisionV1 { principal, request } => {
                let RevisionPreparation::New(prepared) =
                    self.prepare_suggestion_revision(&principal, &request)?
                else {
                    return Err(Error::Contract("durable revision did not prepare"));
                };
                self.suggestions
                    .as_mut()
                    .and_then(|state| state.revisions.as_mut())
                    .ok_or(Error::NeedsRecovery)?
                    .pending = Some((sequence, prepared));
            }
            Event::CommitDocumentSuggestionRevisionV1 { prepared_at, revision_id } => {
                let (first, prepared) = self
                    .suggestions
                    .as_mut()
                    .and_then(|state| state.revisions.as_mut())
                    .and_then(|state| state.pending.take())
                    .ok_or(Error::Contract("revision commit has no preparation"))?;
                if prepared_at != first.to_string()
                    || first.checked_add(1) != Some(sequence)
                    || revision_id != prepared.info.id
                {
                    return Err(Error::Contract("revision commit identity or order"));
                }
                self.publish_suggestion_revision(*prepared, first, sequence)?;
            }
            _ => return Err(Error::Contract("unexpected revision replay record")),
        }
        Ok(())
    }
}

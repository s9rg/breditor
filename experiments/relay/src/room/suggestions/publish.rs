//! Prepare immutable intent, append/fsync, then expose its first authenticated publication.
use super::{
    DocumentSuggestionAdmission, DocumentSuggestionPublication, DurableDocumentSuggestion, Room,
    StoredProposal, SuggestionUpdate, prepare_publication::PublicationPreparation,
};
use crate::{Error, Result, log::Event};
use breditor_collab_feasibility::rich_replica::DocumentSuggestionInfo;
impl Room {
    pub(super) fn remember_suggestion_publication(
        &mut self,
        sequence: u64,
        info: DocumentSuggestionInfo,
        packet: String,
    ) -> Result<DocumentSuggestionPublication> {
        let state = self.suggestions.as_mut().ok_or(Error::NeedsRecovery)?;
        let publication =
            DocumentSuggestionPublication { sequence: sequence.to_string(), suggestion: info };
        state.bytes += packet.len();
        state.proposals.insert(
            publication.suggestion.id.clone(),
            StoredProposal { publication: publication.clone(), packet, decision: None },
        );
        state.updates.insert(sequence, SuggestionUpdate::Published(publication.clone()));
        Ok(publication)
    }
    /// Publish an account's source-proven proposal without changing accepted content or history.
    /// The host owns durable fresh-ID allocation and asset admission; packet strings grant no
    /// authority. Missing source stays client-owned, and repacked retries retain original bytes.
    /// # Errors
    /// Denied/forged authors, unaccepted source cuts, invalid native intents, bounds and I/O reject.
    pub fn publish_document_suggestion(
        &mut self,
        principal: &str,
        packet: &str,
    ) -> Result<DocumentSuggestionAdmission> {
        let preparation = self.prepare_suggestion_publication(principal, packet)?;
        let descriptor = self.document_suggestions_descriptor(principal)?;
        let (publication, duplicate) = match preparation {
            PublicationPreparation::Pending(missing) => {
                return Ok(DocumentSuggestionAdmission::Pending { missing });
            }
            PublicationPreparation::Duplicate(id) => (
                self.suggestions_state()?
                    .proposals
                    .get(&id)
                    .ok_or(Error::NeedsRecovery)?
                    .publication
                    .clone(),
                true,
            ),
            PublicationPreparation::New(info) => {
                let sequence = self.log.append(Event::PublishDocumentSuggestionV1 {
                    principal: principal.into(),
                    packet: packet.into(),
                })?;
                let result = self.remember_suggestion_publication(sequence, info, packet.into());
                if result.is_err() {
                    self.log.invalidate();
                }
                (result?, false)
            }
        };
        Ok(DocumentSuggestionAdmission::Durable(DurableDocumentSuggestion {
            descriptor,
            publication,
            duplicate,
        }))
    }
}

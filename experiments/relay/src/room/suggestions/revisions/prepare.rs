//! Same-author, current-right and original native proof admission before either log record.
use super::super::{
    DocumentSuggestionEntry, MAX_PACKETS_BYTES, check_id,
    prepare_publication::PublicationPreparation,
};
use super::{Room, StoredSuggestionRevision, SuggestionRevisionRequest};
use crate::{Error, Result};
use breditor_collab_feasibility::rich_replica::{
    DocumentSuggestionRevisionInfo, DocumentSuggestionRevisionSource, WriterDependency,
};
pub(super) struct PreparedRevision {
    pub principal: String,
    pub request: SuggestionRevisionRequest,
    pub info: DocumentSuggestionRevisionInfo,
    pub child_packet: String,
    pub root: String,
}
pub(super) enum RevisionPreparation {
    Duplicate(Box<StoredSuggestionRevision>),
    Pending(Vec<WriterDependency>),
    Conflict {
        previous: Box<DocumentSuggestionEntry>,
        successor: Option<Box<StoredSuggestionRevision>>,
    },
    New(Box<PreparedRevision>),
}
impl Room {
    pub(super) fn prepare_suggestion_revision(
        &self,
        principal: &str,
        request: &SuggestionRevisionRequest,
    ) -> Result<RevisionPreparation> {
        let descriptor = self.document_suggestion_revisions_descriptor(principal)?;
        if descriptor.binding != request.binding {
            return Err(Error::Contract("suggestion revision lane binding"));
        }
        if !self.suggestion_permissions(principal)?.can_propose {
            return Err(Error::Permission);
        }
        check_id(&request.previous_suggestion_id)?;
        let state = self.suggestions_state()?;
        let revisions = state.revisions.as_ref().ok_or(Error::NeedsRecovery)?;
        let previous = state
            .proposals
            .get(&request.previous_suggestion_id)
            .ok_or(Error::Contract("revision predecessor not published"))?;
        if previous.publication.suggestion.author.as_str() != principal {
            return Err(Error::Permission);
        }
        let info = self
            .replica
            .read_document_suggestion_revision(&previous.packet, &request.revision_packet)?;
        if info.previous_suggestion_id != request.previous_suggestion_id {
            return Err(Error::Contract("revision predecessor differs"));
        }
        if let Some(known) = revisions.retained.get(&info.id) {
            return Ok(RevisionPreparation::Duplicate(Box::new(known.receipt.clone())));
        }
        if previous.decision.is_some() {
            return Ok(RevisionPreparation::Conflict {
                previous: Box::new(DocumentSuggestionEntry {
                    publication: previous.publication.clone(),
                    decision: previous.decision.clone(),
                }),
                successor: revisions
                    .by_parent
                    .get(&request.previous_suggestion_id)
                    .and_then(|id| revisions.retained.get(id))
                    .map(|row| Box::new(row.receipt.clone())),
            });
        }
        let child_packet = self
            .replica
            .document_suggestion_revision_packet(&previous.packet, &request.revision_packet)?;
        let used = state.bytes.saturating_add(revisions.bytes);
        if request.revision_packet.len().saturating_add(child_packet.len())
            > MAX_PACKETS_BYTES.saturating_sub(used)
        {
            return Err(Error::Contract("suggestion revision retention budget"));
        }
        match self
            .replica
            .verify_document_suggestion_revision(&previous.packet, &request.revision_packet)?
        {
            DocumentSuggestionRevisionSource::Pending { missing } => {
                for clock in &missing {
                    self.check_document_source_writer(&clock.writer)?;
                }
                return Ok(RevisionPreparation::Pending(missing));
            }
            DocumentSuggestionRevisionSource::Verified { revision, clocks } => {
                if revision != info {
                    return Err(Error::Contract("revision native source identity"));
                }
                self.check_document_source_cuts(&clocks)?;
            }
        }
        match self.prepare_suggestion_publication(principal, &child_packet)? {
            PublicationPreparation::New(child) if child == info.suggestion => {}
            PublicationPreparation::Pending(missing) => {
                return Ok(RevisionPreparation::Pending(missing));
            }
            _ => return Err(Error::Contract("revision replacement already published or differs")),
        }
        Ok(RevisionPreparation::New(Box::new(PreparedRevision {
            principal: principal.into(),
            request: request.clone(),
            info,
            child_packet,
            root: revisions
                .roots
                .get(&request.previous_suggestion_id)
                .cloned()
                .unwrap_or_else(|| request.previous_suggestion_id.clone()),
        })))
    }
}

//! Authenticated creator plus native original intent proof and accepted semantic source boundaries.
use super::{MAX_PACKET_BYTES, MAX_PACKETS_BYTES, MAX_PROPOSALS, Room};
use crate::{Error, Result};
use breditor_collab_feasibility::rich_replica::{
    DocumentSuggestionInfo, DocumentSuggestionSource, WriterDependency,
};
pub(super) enum PublicationPreparation {
    Duplicate(String),
    Pending(Vec<WriterDependency>),
    New(DocumentSuggestionInfo),
}
impl Room {
    pub(super) fn prepare_suggestion_publication(
        &self,
        principal: &str,
        packet: &str,
    ) -> Result<PublicationPreparation> {
        if !self.suggestion_permissions(principal)?.can_propose {
            return Err(Error::Permission);
        }
        let state = self.suggestions_state()?;
        if packet.len() > MAX_PACKET_BYTES {
            return Err(Error::Contract("suggestion packet byte budget"));
        }
        let info = self.replica.read_document_suggestion(packet)?;
        if info.author.as_str() != principal {
            return Err(Error::Permission);
        }
        if state.proposals.contains_key(&info.id) {
            return Ok(PublicationPreparation::Duplicate(info.id));
        }
        if state.proposals.len() >= MAX_PROPOSALS
            || packet.len()
                > MAX_PACKETS_BYTES.saturating_sub(state.bytes.saturating_add(
                    state.revisions.as_ref().map_or(0, |revisions| revisions.bytes),
                ))
        {
            return Err(Error::Contract("suggestion publication budget"));
        }
        match self.replica.verify_document_suggestion_source(packet)? {
            DocumentSuggestionSource::Pending { missing } => {
                for clock in &missing {
                    self.check_document_source_writer(&clock.writer)?;
                }
                Ok(PublicationPreparation::Pending(missing))
            }
            DocumentSuggestionSource::Verified { info, clocks } => {
                self.check_document_source_cuts(&clocks)?;
                Ok(PublicationPreparation::New(info))
            }
        }
    }
}

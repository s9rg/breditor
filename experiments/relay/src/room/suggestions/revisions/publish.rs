//! One serialized two-record commit: old intent closes only when its replacement is durable too.
use super::super::{SuggestionDecision, SuggestionDecisionRequest};
use super::{
    DurableSuggestionRevision, RetainedRevision, Room, StoredSuggestionRevision,
    SuggestionRevisionAdmission, SuggestionRevisionRequest,
    prepare::{PreparedRevision, RevisionPreparation},
};
use crate::{Error, Result, log::Event};
impl Room {
    pub(super) fn publish_suggestion_revision(
        &mut self,
        prepared: PreparedRevision,
        first: u64,
        second: u64,
    ) -> Result<StoredSuggestionRevision> {
        if first.checked_add(1) != Some(second) {
            return Err(Error::Contract("revision commit adjacency"));
        }
        let previous_decision = self.publish_suggestion_decision(
            first,
            &prepared.principal,
            &SuggestionDecisionRequest {
                binding: self.suggestions_state()?.binding.clone(),
                suggestion_id: prepared.request.previous_suggestion_id.clone(),
                decision: SuggestionDecision::Reject,
            },
            None,
            None,
        )?;
        let publication = self.remember_suggestion_publication(
            second,
            prepared.info.suggestion.clone(),
            prepared.child_packet,
        )?;
        let receipt = StoredSuggestionRevision {
            root_suggestion_id: prepared.root,
            revision: prepared.info,
            previous_decision,
            publication,
        };
        let revisions = self
            .suggestions
            .as_mut()
            .and_then(|state| state.revisions.as_mut())
            .ok_or(Error::NeedsRecovery)?;
        revisions.bytes += prepared.request.revision_packet.len();
        revisions
            .by_parent
            .insert(receipt.revision.previous_suggestion_id.clone(), receipt.revision.id.clone());
        revisions
            .roots
            .insert(receipt.revision.suggestion.id.clone(), receipt.root_suggestion_id.clone());
        revisions.retained.insert(
            receipt.revision.id.clone(),
            RetainedRevision { receipt: receipt.clone(), packet: prepared.request.revision_packet },
        );
        revisions.updates.insert(second, receipt.revision.id.clone());
        Ok(receipt)
    }
    /// Replace only an account's own still-pending intent. Current Propose permission is sufficient
    /// for this explicit withdrawal-and-replacement, not for arbitrary Reject or document Accept.
    /// The old proposal's single final Reject and new V1 publication appear only after both records
    /// sync. A crash after Prepare alone changes neither. Concurrent Accept/Reject or another
    /// revision wins in server order; this method never reopens final decisions.
    /// # Errors
    /// Disabled/wrong binding, wrong author, revoked rights, native source/cuts/budgets or storage
    /// failures reject. Any uncertain second append fences the room until exact replay.
    pub fn revise_document_suggestion(
        &mut self,
        principal: &str,
        request: &SuggestionRevisionRequest,
    ) -> Result<SuggestionRevisionAdmission> {
        let descriptor = self.document_suggestion_revisions_descriptor(principal)?;
        let (revision, duplicate) = match self.prepare_suggestion_revision(principal, request)? {
            RevisionPreparation::Duplicate(value) => (*value, true),
            RevisionPreparation::Pending(missing) => {
                return Ok(SuggestionRevisionAdmission::Pending { missing });
            }
            RevisionPreparation::Conflict { previous, successor } => {
                return Ok(SuggestionRevisionAdmission::Conflict { previous, successor });
            }
            RevisionPreparation::New(prepared) => {
                let first = self.log.append(Event::PrepareDocumentSuggestionRevisionV1 {
                    principal: principal.into(),
                    request: request.clone(),
                })?;
                let second = match self.log.append(Event::CommitDocumentSuggestionRevisionV1 {
                    prepared_at: first.to_string(),
                    revision_id: prepared.info.id.clone(),
                }) {
                    Ok(sequence) => sequence,
                    Err(error) => {
                        self.log.invalidate();
                        return Err(error);
                    }
                };
                let result = self.publish_suggestion_revision(*prepared, first, second);
                if result.is_err() {
                    self.log.invalidate();
                }
                (result?, false)
            }
        };
        Ok(SuggestionRevisionAdmission::Durable(Box::new(DurableSuggestionRevision {
            descriptor,
            revision,
            duplicate,
        })))
    }
}

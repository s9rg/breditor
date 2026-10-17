//! One server-ordered final decision and its native effect share one durable acceptance record.
use super::{
    DocumentSuggestionDecisionAdmission, DurableSuggestionDecision, Room, StoredSuggestionDecision,
    SuggestionDecision, SuggestionDecisionRequest, SuggestionEffect, SuggestionUpdate, check_id,
    prepare_effect::{EffectPreparation, PreparedEffect},
};
use crate::{Error, Result, log::Event};
pub(super) enum DecisionPreparation {
    Duplicate(Box<StoredSuggestionDecision>),
    Pending(Vec<breditor_collab_feasibility::rich_replica::WriterDependency>),
    Conflict(Vec<breditor_collab_feasibility::rich_replica::SuggestionConflictTarget>),
    New(Option<Box<PreparedEffect>>),
}
impl Room {
    pub(super) fn prepare_suggestion_decision(
        &self,
        principal: &str,
        request: &SuggestionDecisionRequest,
        recorded_frame: Option<&str>,
    ) -> Result<DecisionPreparation> {
        self.check_suggestion_decision_right(principal, request.decision)?;
        let state = self.suggestions_state()?;
        if request.binding != state.binding {
            return Err(Error::Contract("suggestion decision lane binding"));
        }
        check_id(&request.suggestion_id)?;
        let proposal = state
            .proposals
            .get(&request.suggestion_id)
            .ok_or(Error::Contract("suggestion not published"))?;
        if let Some(decision) = &proposal.decision {
            return Ok(DecisionPreparation::Duplicate(Box::new(decision.clone())));
        }
        if request.decision == SuggestionDecision::Reject {
            if recorded_frame.is_some() {
                return Err(Error::Contract("Reject must not contain a document effect"));
            }
            return Ok(DecisionPreparation::New(None));
        }
        Ok(match self.prepare_suggestion_effect(&proposal.packet, recorded_frame)? {
            EffectPreparation::Pending(missing) => DecisionPreparation::Pending(missing),
            EffectPreparation::Conflict(targets) => DecisionPreparation::Conflict(targets),
            EffectPreparation::Ready(effect) => DecisionPreparation::New(Some(effect)),
        })
    }
    pub(super) fn publish_suggestion_decision(
        &mut self,
        sequence: u64,
        principal: &str,
        request: &SuggestionDecisionRequest,
        prepared: Option<Box<PreparedEffect>>,
        accepting_writer: Option<&str>,
    ) -> Result<StoredSuggestionDecision> {
        let effect: Option<SuggestionEffect> = if let Some(prepared) = prepared {
            self.replica.commit_writer_group(*prepared.receiver)?;
            self.remember(sequence, prepared.effect.writer_group.clone());
            self.suggestions.as_mut().ok_or(Error::NeedsRecovery)?.effect_owner = prepared.owner;
            Some(prepared.effect)
        } else {
            None
        };
        let decision = StoredSuggestionDecision {
            sequence: sequence.to_string(),
            suggestion_id: request.suggestion_id.clone(),
            principal: principal.into(),
            accepting_writer: accepting_writer.map(String::from),
            decision: request.decision,
            effect,
        };
        let state = self.suggestions.as_mut().ok_or(Error::NeedsRecovery)?;
        state.proposals.get_mut(&request.suggestion_id).ok_or(Error::NeedsRecovery)?.decision =
            Some(decision.clone());
        state.updates.insert(sequence, SuggestionUpdate::Decided(decision.clone()));
        Ok(decision)
    }
    /// Finalize once under the host's authenticated room serialization lock. Accept stages a native
    /// edit under the reserved host writer; Reject stages no document mutation. The caller owns
    /// referenced asset admission/retention and permanent fresh-ID allocation. No HTTP/SDK endpoint
    /// or accepting-user Undo adoption is implied by this native reference-host primitive.
    /// # Errors
    /// Current permissions, exact lane/ID, native admission, source conflicts, bounds or I/O can
    /// refuse. Missing/conflicting targets append nothing. An uncertain append fences the room.
    pub fn decide_document_suggestion(
        &mut self,
        principal: &str,
        request: &SuggestionDecisionRequest,
    ) -> Result<DocumentSuggestionDecisionAdmission> {
        self.decide_suggestion_inner(principal, request, None)
    }
    pub(super) fn decide_suggestion_inner(
        &mut self,
        principal: &str,
        request: &SuggestionDecisionRequest,
        accepting_writer: Option<&str>,
    ) -> Result<DocumentSuggestionDecisionAdmission> {
        let prepared = self.prepare_suggestion_decision(principal, request, None)?;
        let descriptor = self.document_suggestions_descriptor(principal)?;
        let (decision, duplicate) = match prepared {
            DecisionPreparation::Duplicate(decision) => (*decision, true),
            DecisionPreparation::Pending(missing) => {
                return Ok(DocumentSuggestionDecisionAdmission::Pending { missing });
            }
            DecisionPreparation::Conflict(targets) => {
                return Ok(DocumentSuggestionDecisionAdmission::Conflict { targets });
            }
            DecisionPreparation::New(effect) => {
                let metadata = effect.as_ref().map(|prepared| prepared.effect.clone());
                let frame = effect.as_ref().map(|prepared| prepared.frame.clone());
                let event = if let Some(writer) = accepting_writer {
                    Event::DecideOwnedDocumentSuggestionV1 {
                        principal: principal.into(),
                        accepting_writer: writer.into(),
                        request: request.clone(),
                        effect: metadata,
                        frame,
                    }
                } else {
                    Event::DecideDocumentSuggestionV1 {
                        principal: principal.into(),
                        request: request.clone(),
                        effect: metadata,
                        frame,
                    }
                };
                let sequence = self.log.append(event)?;
                let result = self.publish_suggestion_decision(
                    sequence,
                    principal,
                    request,
                    effect,
                    accepting_writer,
                );
                if result.is_err() {
                    self.log.invalidate();
                }
                (result?, false)
            }
        };
        Ok(DocumentSuggestionDecisionAdmission::Durable(Box::new(DurableSuggestionDecision {
            descriptor,
            decision,
            duplicate,
        })))
    }
}

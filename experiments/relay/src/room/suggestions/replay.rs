//! Prove original permission, native intent and exact effect receipt before repairing any torn tail.
use super::{
    EFFECT_WRITER, Room, decide::DecisionPreparation, prepare_publication::PublicationPreparation,
};
use crate::{Error, Result, log::Event};
impl Room {
    pub(in crate::room) fn replay_document_suggestions(
        &mut self,
        sequence: u64,
        event: Event,
    ) -> Result<()> {
        match event {
            event @ (Event::EnableDocumentSuggestionRevisionsV1 { .. }
            | Event::PrepareDocumentSuggestionRevisionV1 { .. }
            | Event::CommitDocumentSuggestionRevisionV1 { .. }) => {
                self.replay_suggestion_revision(sequence, event)?;
            }
            Event::EnableDocumentSuggestionsV1 { actor, binding, effect_writer } => {
                if actor != self.owner
                    || self.suggestions.is_some()
                    || effect_writer != EFFECT_WRITER
                {
                    return Err(Error::Contract("suggestion activation lineage"));
                }
                self.suggestions = Some(self.new_suggestions_state(&binding, sequence)?);
            }
            Event::GrantDocumentSuggestionsV1 { actor, principal, role } => {
                self.check_suggestion_grant(&actor, &principal, role)?;
                self.apply_suggestion_grant(principal, role)?;
            }
            Event::PublishDocumentSuggestionV1 { principal, packet } => {
                let PublicationPreparation::New(info) =
                    self.prepare_suggestion_publication(&principal, &packet)?
                else {
                    return Err(Error::Contract("durable suggestion did not prepare"));
                };
                self.remember_suggestion_publication(sequence, info, packet)?;
            }
            Event::DecideDocumentSuggestionV1 { principal, request, effect, frame } => {
                let DecisionPreparation::New(prepared) =
                    self.prepare_suggestion_decision(&principal, &request, frame.as_deref())?
                else {
                    return Err(Error::Contract("durable suggestion decision did not prepare"));
                };
                if prepared.as_ref().map(|prepared| &prepared.effect) != effect.as_ref()
                    || prepared.is_some() != frame.is_some()
                {
                    return Err(Error::Contract("durable suggestion decision effect differs"));
                }
                self.publish_suggestion_decision(sequence, &principal, &request, prepared, None)?;
            }
            Event::DecideOwnedDocumentSuggestionV1 {
                principal,
                accepting_writer,
                request,
                effect,
                frame,
            } => {
                self.owns(&principal, &accepting_writer)?;
                if request.decision != super::SuggestionDecision::Accept {
                    return Err(Error::Contract("owned suggestion finalization requires Accept"));
                }
                let DecisionPreparation::New(prepared) =
                    self.prepare_suggestion_decision(&principal, &request, frame.as_deref())?
                else {
                    return Err(Error::Contract(
                        "durable owned suggestion decision did not prepare",
                    ));
                };
                if prepared.as_ref().map(|prepared| &prepared.effect) != effect.as_ref()
                    || prepared.is_some() != frame.is_some()
                {
                    return Err(Error::Contract("durable owned suggestion effect differs"));
                }
                self.publish_suggestion_decision(
                    sequence,
                    &principal,
                    &request,
                    prepared,
                    Some(&accepting_writer),
                )?;
            }
            _ => return Err(Error::Contract("unexpected suggestion replay record")),
        }
        Ok(())
    }
}

//! A private exclusive host author and staged receiver, both unpublished until the decision fsync.
use super::{EFFECT_WRITER, Room, SuggestionEffect};
use crate::{Error, Receipt, Result};
use breditor_collab_feasibility::rich_replica::{
    DocumentSuggestionPreparation, PreparedWriterGroup, RichReplica, SuggestionConflictTarget,
    WriterDependency, WriterGroupPreparation,
};
pub(super) struct PreparedEffect {
    pub owner: RichReplica,
    pub receiver: Box<PreparedWriterGroup>,
    pub effect: SuggestionEffect,
    pub frame: String,
}
pub(super) enum EffectPreparation {
    Pending(Vec<WriterDependency>),
    Conflict(Vec<SuggestionConflictTarget>),
    Ready(Box<PreparedEffect>),
}
impl Room {
    pub(super) fn prepare_suggestion_effect(
        &self,
        packet: &str,
        recorded_frame: Option<&str>,
    ) -> Result<EffectPreparation> {
        let state = self.suggestions_state()?;
        let checkpoint =
            crate::room::native_history::checkpoint::document_checkpoint(&state.effect_owner)?;
        let mut owner = self.restore_history_candidate(&state.effect_owner, &checkpoint)?;
        owner.receive_frame(&self.replica.update_frame()?)?;
        if owner.document_json() != self.replica.document_json() {
            return Err(Error::Contract("suggestion effect source differs from accepted room"));
        }
        let preview =
            match owner.prepare_document_suggestion_guarded(&owner.observe_document()?, packet)? {
                DocumentSuggestionPreparation::Pending { missing } => {
                    return Ok(EffectPreparation::Pending(missing));
                }
                DocumentSuggestionPreparation::Conflict { targets } => {
                    return Ok(EffectPreparation::Conflict(targets));
                }
                DocumentSuggestionPreparation::Ready(preview) => preview,
            };
        let native = owner.prepare_document_suggestion_effect(&preview)?;
        let effect = SuggestionEffect {
            writer_group: Receipt::from(native.effect().writer_group.clone()),
            semantic_from: native.effect().semantic_from.clone(),
        };
        let frame = recorded_frame.unwrap_or(native.writer_group_json()).to_owned();
        owner.commit_document_suggestion_effect(native)?;
        let WriterGroupPreparation::Prepared(receiver) =
            self.replica.prepare_writer_group_v2(EFFECT_WRITER, &frame)?
        else {
            return Err(Error::Contract("new suggestion effect did not prepare"));
        };
        if Receipt::from(receiver.receipt().clone()) != effect.writer_group
            || receiver.document_json() != owner.document_json()
        {
            return Err(Error::Contract("recorded suggestion effect differs from native intent"));
        }
        self.check_prepared_document_history(&receiver)?;
        crate::room::native_history::checkpoint::document_checkpoint(&owner)?;
        receiver.update_frame()?;
        Ok(EffectPreparation::Ready(Box::new(PreparedEffect { owner, receiver, effect, frame })))
    }
}

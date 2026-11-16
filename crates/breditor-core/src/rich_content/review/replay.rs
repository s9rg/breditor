//! Semantic validation state for an already checked causal prefix. It grants no live rights.
use super::{
    ReviewActorId, ReviewActorPolicy, ReviewBinding, ReviewError, ReviewEventId, ReviewPrincipalId,
    ReviewSession,
    causal_births::CausalBirths,
    event::{self, Event, Payload},
};
use std::collections::{BTreeMap, btree_map::Entry};

struct ActorReplay {
    principal: ReviewPrincipalId,
    digest: String,
    stack: Vec<ReviewEventId>,
    cursor: usize,
}

#[derive(Default)]
pub(super) struct ReviewReplay {
    actors: BTreeMap<ReviewActorId, ActorReplay>,
    births: CausalBirths,
}

impl ReviewReplay {
    pub(super) fn validate_ordered(
        session: &ReviewSession,
        ordered: &[&Event],
    ) -> Result<Self, ReviewError> {
        let mut replay = Self::default();
        for &event in ordered {
            replay.apply(&session.binding, &session.policy, event)?;
        }
        replay.check_history(session)?;
        Ok(replay)
    }

    /// Extend a private candidate with one event whose causal order has been checked.
    pub(super) fn apply(
        &mut self,
        binding: &ReviewBinding,
        policy: &ReviewActorPolicy,
        event: &Event,
    ) -> Result<(), ReviewError> {
        let actor = match self.actors.entry(event.id.actor.clone()) {
            Entry::Occupied(existing) => {
                if event.previous_digest != existing.get().digest
                    || event.principal != existing.get().principal
                {
                    return Err(ReviewError::Fork);
                }
                existing.into_mut()
            }
            Entry::Vacant(first) => {
                if event.previous_digest
                    != event::genesis(binding, &event.id.actor, &event.principal)?
                {
                    return Err(ReviewError::Fork);
                }
                first.insert(ActorReplay {
                    principal: event.principal.clone(),
                    digest: String::new(),
                    stack: Vec::new(),
                    cursor: 0,
                })
            }
        };
        if event.id.actor == policy.actor && event.principal != policy.principal {
            return Err(ReviewError::Permission);
        }
        match &event.payload {
            Payload::Action(action) => {
                self.births.validate_action(binding, action, &event.dependencies)?;
                self.births.record_validated_action(&event.id, action);
                actor.stack.truncate(actor.cursor);
                actor.stack.push(event.id.clone());
                actor.cursor = actor.stack.len();
            }
            Payload::Visibility { target, visible: false } => {
                if actor.cursor == 0 || actor.stack.get(actor.cursor - 1) != Some(target) {
                    return Err(ReviewError::Contract("review Undo stack"));
                }
                actor.cursor -= 1;
            }
            Payload::Visibility { target, visible: true } => {
                if actor.stack.get(actor.cursor) != Some(target) {
                    return Err(ReviewError::Contract("review Redo stack"));
                }
                actor.cursor += 1;
            }
        }
        actor.digest = event::digest(event)?;
        Ok(())
    }

    pub(super) fn check_history(&self, session: &ReviewSession) -> Result<(), ReviewError> {
        if self.actors.len() > 1024 {
            return Err(ReviewError::Limit("causal actors"));
        }
        // The derived stack contains distinct authored actions of this actor.
        // Matching it checks the full partition and the independent Redo branch.
        let (history, cursor) = self
            .actors
            .get(&session.policy.actor)
            .map_or((&[][..], 0), |actor| (actor.stack.as_slice(), actor.cursor));
        if session.history != history || session.cursor != cursor {
            return Err(ReviewError::Contract("review history replay"));
        }
        Ok(())
    }
}

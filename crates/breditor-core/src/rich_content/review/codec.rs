//! Separate exact recovery and owned-stream import; no document checkpoint grammar is widened.
mod transport;
use super::{
    ReviewActorId, ReviewActorPolicy, ReviewBinding, ReviewError, ReviewEventId,
    ReviewImportOutcome, ReviewObservation, ReviewSession,
    event::{self, Event, Payload},
};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};
pub use transport::{
    PreparedReviewBatch, ReviewBatchPreparation, ReviewBatchReceipt, ReviewWriterClock,
};

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct Checkpoint<Events> {
    format: String,
    format_version: u32,
    binding: ReviewBinding,
    actor: ReviewActorId,
    principal: super::ReviewPrincipalId,
    events: Events,
    history: Vec<ReviewEventId>,
    cursor: usize,
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct Frame {
    format: String,
    format_version: u32,
    binding: ReviewBinding,
    events: Vec<Event>,
}
impl ReviewSession {
    /// Serialize exact metadata and local history. Live permissions are deliberately absent.
    /// # Errors
    /// Serialization or the unchanged review checkpoint ceiling rejects without mutation.
    pub fn checkpoint_json(&self) -> Result<String, ReviewError> {
        if self.generations.is_some() {
            return Err(ReviewError::Contract("review history family"));
        }
        self.checkpoint_json_with_order(&event::ordered(&self.events, event::MAX_EVENTS)?)
    }
    pub(super) fn checkpoint_json_with_order(
        &self,
        ordered: &[&Event],
    ) -> Result<String, ReviewError> {
        let json = serde_json::to_string(&Checkpoint {
            format: "breditor/review-session".into(),
            format_version: 1,
            binding: self.binding.clone(),
            actor: self.policy.actor.clone(),
            principal: self.policy.principal.clone(),
            events: ordered,
            history: self.history.clone(),
            cursor: self.cursor,
        })?;
        if json.len() > event::MAX_BYTES {
            return Err(ReviewError::Limit("checkpoint bytes"));
        }
        Ok(json)
    }
    /// Restore the declared metadata family with fresh host authority, not saved permission claims.
    /// # Errors
    /// Identity/binding mismatch, malformed history, event forks/dependencies or budgets reject.
    pub fn restore_json(
        binding: &ReviewBinding,
        policy: ReviewActorPolicy,
        input: &str,
    ) -> Result<Self, ReviewError> {
        if input.len() > event::MAX_BYTES {
            return Err(ReviewError::Limit("checkpoint bytes"));
        }
        let saved: Checkpoint<Vec<Event>> = serde_json::from_str(input)?;
        if saved.format != "breditor/review-session"
            || saved.format_version != 1
            || saved.binding != *binding
            || saved.actor != policy.actor
            || saved.principal != policy.principal
        {
            return Err(ReviewError::Contract("review recovery binding"));
        }
        let mut result = Self::new(saved.binding, policy)?;
        result.events = saved.events;
        result.history = saved.history;
        result.cursor = saved.cursor;
        result.admit()?;
        if result.checkpoint_json()? != input {
            return Err(ReviewError::Contract("canonical review recovery"));
        }
        Ok(result)
    }
    /// Export a bounded prefix of this writer's stream after an exact last-acknowledged counter.
    /// The receiver's host must authenticate actor/account/rights independently.
    /// # Errors
    /// Serialization or a single over-budget event rejects; no partial event is returned.
    pub fn export_frame(&self, after: u64) -> Result<String, ReviewError> {
        self.export_frame_through(
            after,
            event::clock(&self.events).get(&self.policy.actor).map_or(0, |c| c.0),
        )
    }
    /// Export a bounded prefix of a previously captured authored end, excluding later actions.
    /// # Errors
    /// Nonexistent/reversed ranges, serialization and the unchanged native frame budgets reject.
    pub fn export_frame_through(&self, after: u64, through: u64) -> Result<String, ReviewError> {
        if after > through
            || through > event::clock(&self.events).get(&self.policy.actor).map_or(0, |c| c.0)
        {
            return Err(ReviewError::Contract("review export starts beyond local stream"));
        }
        let events = self
            .events
            .iter()
            .filter(|e| {
                e.id.actor == self.policy.actor
                    && e.id.counter.0 > after
                    && e.id.counter.0 <= through
            })
            .cloned()
            .collect::<Vec<_>>();
        let mut frame = Frame {
            format: "breditor/review-events".into(),
            format_version: 1,
            binding: self.binding.clone(),
            events: vec![],
        };
        for event in events {
            frame.events.push(event);
            if serde_json::to_vec(&frame)?.len() > event::MAX_FRAME_BYTES {
                frame.events.pop();
                break;
            }
            if frame.events.len() == 128 {
                break;
            }
        }
        if frame.events.is_empty()
            && self.events.iter().any(|e| {
                e.id.actor == self.policy.actor
                    && e.id.counter.0 > after
                    && e.id.counter.0 <= through
            })
        {
            return Err(ReviewError::Limit("event frame bytes"));
        }
        Ok(serde_json::to_string(&frame)?)
    }
    /// Atomically import a complete writer batch under host-verified admission authority.
    /// Missing dependencies return Pending without an acknowledgement or mutation. Historical
    /// catchup requires its authenticated original grant, not a role claimed by payload data.
    /// # Errors
    /// Wrong binding/actor, forks, own-writer extension, unauthorized actions or budgets reject.
    pub fn receive_authorized(
        &mut self,
        observed: &ReviewObservation,
        verified: &ReviewActorPolicy,
        input: &str,
    ) -> Result<ReviewImportOutcome, ReviewError> {
        self.receive_authorized_with_anchor_validation(observed, verified, input, |_| Ok(()))
    }
    /// Import with native document-owner validation of every newly admitted anchor.
    /// The validator is read-only; an error rolls back the entire metadata batch. Missing
    /// document dependencies may be retained as pending anchors, not substituted targets.
    /// # Errors
    /// The ordinary admission failures or any backend anchor rejection leave this owner unchanged.
    pub fn receive_authorized_with_anchor_validation(
        &mut self,
        observed: &ReviewObservation,
        verified: &ReviewActorPolicy,
        input: &str,
        mut validate_anchor: impl FnMut(&str) -> Result<(), ReviewError>,
    ) -> Result<ReviewImportOutcome, ReviewError> {
        self.check(observed)?;
        if input.len() > event::MAX_FRAME_BYTES {
            return Err(ReviewError::Limit("frame bytes"));
        }
        let frame: Frame = serde_json::from_str(input)?;
        if frame.format != "breditor/review-events"
            || frame.format_version != 1
            || frame.binding != self.binding
        {
            return Err(ReviewError::Contract("review frame binding"));
        }
        if frame.events.len() > 128 {
            return Err(ReviewError::Limit("frame events"));
        }
        let mut candidate = self.staged();
        let mut changed = false;
        for event in frame.events {
            if event.id.actor != verified.actor || event.principal != verified.principal {
                return Err(ReviewError::Permission);
            }
            if let Some(known) = candidate.events.iter().find(|e| e.id == event.id) {
                if *known != event {
                    return Err(ReviewError::Fork);
                }
                continue;
            }
            if event.id.actor == self.policy.actor {
                return Err(ReviewError::WriterCollision);
            }
            if event.dependencies.len() > 1024 {
                return Err(ReviewError::Limit("causal actors"));
            }
            if event.dependencies.get(&event.id.actor).map_or(0, |c| c.0).checked_add(1)
                != Some(event.id.counter.0)
            {
                return Err(ReviewError::Fork);
            }
            let known = event::clock(&candidate.events);
            let missing = event
                .dependencies
                .iter()
                .filter(|(a, c)| known.get(a).is_none_or(|n| n < *c))
                .map(|(a, c)| ReviewEventId { actor: a.clone(), counter: *c })
                .collect::<Vec<_>>();
            if !missing.is_empty() {
                return Ok(ReviewImportOutcome::Pending(missing));
            }
            let base = candidate
                .events
                .iter()
                .filter(|e| event::observes(&event.dependencies, &e.id))
                .cloned()
                .collect::<Vec<_>>();
            if let Payload::Action(action) = &event.payload {
                match action {
                    super::actions::ReviewAction::CreateThread(a) => {
                        validate_anchor(&a.anchor_json)?;
                    }
                    super::actions::ReviewAction::ReanchorThread(a) => {
                        validate_anchor(&a.anchor_json)?;
                    }
                    _ => {}
                }
                self.projection(&base)?.validate_action(
                    &self.binding,
                    action,
                    Some(verified),
                    &event.dependencies,
                )?;
            } else if let Payload::Visibility { target, .. } = &event.payload {
                let original = base
                    .iter()
                    .find(|e| e.id == *target)
                    .ok_or(ReviewError::Contract("unobserved history target"))?;
                let Payload::Action(action) = &original.payload else {
                    return Err(ReviewError::Contract("history toggle target"));
                };
                self.projection(&base)?.validate_action(
                    &self.binding,
                    action,
                    Some(verified),
                    &event.dependencies,
                )?;
            }
            candidate.events.push(event);
            changed = true;
        }
        if !changed {
            return Ok(ReviewImportOutcome::Unchanged);
        }
        candidate.admit()?;
        self.adopt(candidate);
        Ok(ReviewImportOutcome::Applied)
    }
}
pub(super) fn validate_ordered(
    session: &ReviewSession,
    ordered: &[&Event],
) -> Result<(), ReviewError> {
    let mut principals = BTreeMap::new();
    let mut local_targets = BTreeSet::new();
    let mut streams = BTreeMap::<ReviewActorId, &Event>::new();
    let mut histories = BTreeMap::<_, (Vec<ReviewEventId>, usize)>::new();
    let mut births = super::causal_births::CausalBirths::default();
    for &event in ordered {
        let expected = streams.get(&event.id.actor).map_or_else(
            || event::genesis(&session.binding, &event.id.actor, &event.principal),
            |previous| event::digest(previous),
        )?;
        if event.previous_digest != expected {
            return Err(ReviewError::Fork);
        }
        streams.insert(event.id.actor.clone(), event);
        if let Some(old) = principals.insert(&event.id.actor, &event.principal)
            && old != &event.principal
        {
            return Err(ReviewError::Fork);
        }
        if event.id.actor == session.policy.actor && event.principal != session.policy.principal {
            return Err(ReviewError::Permission);
        }
        if let Payload::Action(action) = &event.payload {
            births.validate_action(&session.binding, action, &event.dependencies)?;
            births.record_validated_action(&event.id, action);
            if event.id.actor == session.policy.actor {
                local_targets.insert(&event.id);
            }
        }
        let (stack, cursor) = histories.entry(event.id.actor.clone()).or_default();
        match &event.payload {
            Payload::Action(_) => {
                stack.truncate(*cursor);
                stack.push(event.id.clone());
                *cursor = stack.len();
            }
            Payload::Visibility { target, visible: false } => {
                if *cursor == 0 || stack.get(*cursor - 1) != Some(target) {
                    return Err(ReviewError::Contract("review Undo stack"));
                }
                *cursor -= 1;
            }
            Payload::Visibility { target, visible: true } => {
                if stack.get(*cursor) != Some(target) {
                    return Err(ReviewError::Contract("review Redo stack"));
                }
                *cursor += 1;
            }
        }
    }
    if streams.len() > 1024 {
        return Err(ReviewError::Limit("causal actors"));
    }
    let expected = histories.get(&session.policy.actor).cloned().unwrap_or_default();
    if expected != (session.history.clone(), session.cursor) {
        return Err(ReviewError::Contract("review history replay"));
    }
    let mut unique = BTreeSet::new();
    if session.cursor > session.history.len()
        || session.history.iter().any(|id| !local_targets.contains(id) || !unique.insert(id))
    {
        return Err(ReviewError::Contract("review history partition"));
    }
    Ok(())
}

//! Separate exact recovery and owned-stream import; no document checkpoint grammar is widened.
mod transport;
use super::{
    ReviewActorId, ReviewActorPolicy, ReviewBinding, ReviewError, ReviewEventId,
    ReviewImportOutcome, ReviewObservation, ReviewSession,
    batch_admission::{AnchorCheck, BatchAdmission},
    event::{self, Event},
    materialize::Projection,
    replay::ReviewReplay,
};
use serde::{Deserialize, Serialize};
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
        Self::restore_original_with_replay(binding, policy, input).map(|(owner, _)| owner)
    }

    pub(super) fn restore_original_with_replay(
        binding: &ReviewBinding,
        policy: ReviewActorPolicy,
        input: &str,
    ) -> Result<(Self, ReviewReplay), ReviewError> {
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
        let ordered = event::ordered(&result.events, result.event_limit())?;
        let replay = ReviewReplay::validate_ordered(&result, &ordered)?;
        let canonical = result.checkpoint_json_with_order(&ordered)?;
        Projection::from_ordered(&ordered)?;
        if canonical != input {
            return Err(ReviewError::Contract("canonical review recovery"));
        }
        Ok((result, replay))
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
        validate_anchor: impl FnMut(&str) -> Result<(), ReviewError>,
    ) -> Result<ReviewImportOutcome, ReviewError> {
        self.check(observed)?;
        let frame = self.decode_frame(input)?;
        if frame.events.is_empty() {
            return Ok(ReviewImportOutcome::Unchanged);
        }
        let mut candidate = self.staged();
        let outcome = candidate.apply_frame(verified, &frame, validate_anchor)?;
        if outcome == ReviewImportOutcome::Applied {
            self.adopt(candidate);
        }
        Ok(outcome)
    }

    fn decode_frame(&self, input: &str) -> Result<Frame, ReviewError> {
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
        Ok(frame)
    }

    // Only used on a private staged owner. Incomplete or refused frames can
    // leave a private prefix here, which the caller discards without publication.
    fn apply_frame(
        &mut self,
        verified: &ReviewActorPolicy,
        frame: &Frame,
        mut validate_anchor: impl FnMut(&str) -> Result<(), ReviewError>,
    ) -> Result<ReviewImportOutcome, ReviewError> {
        let mut admission = BatchAdmission::new(self);
        let start = self.events.len();
        for event in &frame.events {
            if event.id.actor != verified.actor || event.principal != verified.principal {
                return Err(ReviewError::Permission);
            }
            if let Some(known) = admission.lookup(&self.events, &event.id) {
                if known != event {
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
            let missing = admission.missing_dependencies(&self.events, event);
            if !missing.is_empty() {
                return Ok(ReviewImportOutcome::Pending(missing));
            }
            admission.append(
                self,
                event.clone(),
                verified,
                AnchorCheck::IncomingAction,
                &mut validate_anchor,
            )?;
        }
        if self.events.len() == start {
            return Ok(ReviewImportOutcome::Unchanged);
        }
        self.admit()?;
        Ok(ReviewImportOutcome::Applied)
    }
}

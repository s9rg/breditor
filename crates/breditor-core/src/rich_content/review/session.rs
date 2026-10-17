//! One exclusive metadata owner with independent author-local contribution history.
use super::{
    ReviewAccess, ReviewActorPolicy, ReviewBinding, ReviewError, ReviewEventId, ReviewOutcome,
    ReviewView,
    actions::ReviewAction,
    event::{self, Event, Payload},
    materialize::Projection,
};
use std::sync::Arc;

/// Exact owner/publication witness. It cannot be serialized into a permission or replayed elsewhere.
#[derive(Clone)]
pub struct ReviewObservation(Arc<()>);
/// Import outcome; missing dependencies are not silently acknowledged or forgotten.
#[derive(Clone, Debug, Eq, PartialEq, serde::Serialize)]
#[serde(tag = "kind", content = "missing", rename_all = "snake_case")]
pub enum ReviewImportOutcome {
    /// Every supplied event was already retained byte-semantically unchanged.
    Unchanged,
    /// An authorized complete batch was atomically retained.
    Applied,
    /// The caller must retain/retry its unacknowledged frame after these events arrive.
    Pending(Vec<ReviewEventId>),
}
/// Separate native review metadata owner. Document adapters compose its staged publication
/// with actual native anchor admission; this type never edits accepted document content.
pub struct ReviewSession {
    pub(super) binding: ReviewBinding,
    pub(super) policy: ReviewActorPolicy,
    pub(super) events: Vec<Event>,
    pub(super) history: Vec<ReviewEventId>,
    pub(super) cursor: usize,
    token: Arc<()>,
}
impl ReviewSession {
    /// Create an empty review sidecar under explicit document binding and live host authority.
    /// # Errors
    /// Malformed bindings reject; no network identity or permission is inferred.
    pub fn new(binding: ReviewBinding, policy: ReviewActorPolicy) -> Result<Self, ReviewError> {
        binding.validate()?;
        Ok(Self {
            binding,
            policy,
            events: vec![],
            history: vec![],
            cursor: 0,
            token: Arc::new(()),
        })
    }
    /// Freeze this exact review publication before capture/queuing.
    #[must_use]
    pub fn observe(&self) -> ReviewObservation {
        ReviewObservation(self.token.clone())
    }
    /// Immutable document/schema binding. Matching it does not grant any authoring rights.
    #[must_use]
    pub fn binding(&self) -> &ReviewBinding {
        &self.binding
    }
    /// Every retained native anchor, including undone originals needed by future Redo.
    /// Document adapters validate these opaque packets without interpreting cursors here.
    pub fn anchor_packets(&self) -> impl Iterator<Item = &str> {
        self.events.iter().filter_map(|event| match &event.payload {
            Payload::Action(ReviewAction::CreateThread(a)) => Some(a.anchor_json.as_str()),
            Payload::Action(ReviewAction::ReanchorThread(a)) => Some(a.anchor_json.as_str()),
            _ => None,
        })
    }
    /// Reject an older or foreign metadata publication; this observation grants no permissions.
    /// # Errors
    /// Any token other than this exact live owner's current observation is stale.
    pub fn check(&self, observed: &ReviewObservation) -> Result<(), ReviewError> {
        if !Arc::ptr_eq(&self.token, &observed.0) {
            return Err(ReviewError::Stale);
        }
        Ok(())
    }
    /// Read all discussion values, attribution and this writer's independent history depths.
    /// # Errors
    /// Rejects a broken internal event/dependency invariant rather than fabricating a projection.
    pub fn view(&self) -> Result<ReviewView, ReviewError> {
        Ok(ReviewView {
            threads: Projection::build(&self.events)?.view(),
            undo_depth: self.cursor,
            redo_depth: self.history.len() - self.cursor,
        })
    }
    /// Replace only live access policy, retaining identities, content and both history branches.
    /// # Errors
    /// An older or foreign review observation rejects before policy publication.
    pub fn set_access(
        &mut self,
        observed: &ReviewObservation,
        access: ReviewAccess,
    ) -> Result<(), ReviewError> {
        self.check(observed)?;
        if self.policy.access != access {
            self.policy.access = access;
            self.token = Arc::new(());
        }
        Ok(())
    }
    fn next(&self, payload: Payload) -> Result<Event, ReviewError> {
        let dependencies = event::clock(&self.events);
        let counter = dependencies
            .get(&self.policy.actor)
            .map_or(0, |v| v.0)
            .checked_add(1)
            .ok_or(ReviewError::Limit("counter"))?;
        Ok(Event {
            id: ReviewEventId::try_new(self.policy.actor.clone(), counter)?,
            principal: self.policy.principal.clone(),
            dependencies,
            previous_digest: self
                .events
                .iter()
                .filter(|e| e.id.actor == self.policy.actor)
                .max_by_key(|e| e.id.counter)
                .map_or_else(
                    || event::genesis(&self.binding, &self.policy.actor, &self.policy.principal),
                    event::digest,
                )?,
            payload,
        })
    }
    /// Publish one original review action under the exact observed metadata state.
    /// # Errors
    /// Permission, body/anchor binding, source, identity, dependency and resource failures are atomic.
    pub fn dispatch(
        &mut self,
        observed: &ReviewObservation,
        action: ReviewAction,
    ) -> Result<ReviewOutcome, ReviewError> {
        self.check(observed)?;
        let projection = Projection::build(&self.events)?;
        projection.validate_action(
            &self.binding,
            &action,
            Some(&self.policy),
            &event::clock(&self.events),
        )?;
        if projection.is_noop(&action) {
            return Ok(ReviewOutcome::Unchanged);
        }
        let event = self.next(Payload::Action(action))?;
        let mut candidate = self.staged();
        candidate.events.push(event.clone());
        candidate.history.truncate(candidate.cursor);
        candidate.history.push(event.id.clone());
        candidate.cursor = candidate.history.len();
        candidate.admit()?;
        self.adopt(candidate);
        Ok(ReviewOutcome::Committed(event.id))
    }
    pub(super) fn staged(&self) -> Self {
        Self {
            binding: self.binding.clone(),
            policy: self.policy.clone(),
            events: self.events.clone(),
            history: self.history.clone(),
            cursor: self.cursor,
            token: Arc::new(()),
        }
    }
    pub(super) fn adopt(&mut self, candidate: Self) {
        *self = candidate;
    }
    pub(super) fn admit(&self) -> Result<(), ReviewError> {
        super::codec::validate_all(self)?;
        event::ordered(&self.events)?;
        if self.events.len() > event::MAX_EVENTS {
            return Err(ReviewError::Limit("events"));
        }
        self.checkpoint_json()?;
        Projection::build(&self.events)?;
        Ok(())
    }
    pub(super) fn history_step(
        &mut self,
        observed: &ReviewObservation,
        redo: bool,
    ) -> Result<ReviewOutcome, ReviewError> {
        self.check(observed)?;
        if self.policy.access == ReviewAccess::ReadOnly {
            return Err(ReviewError::Permission);
        }
        if (redo && self.cursor == self.history.len()) || (!redo && self.cursor == 0) {
            return Ok(ReviewOutcome::Unchanged);
        }
        let index = if redo { self.cursor } else { self.cursor - 1 };
        let target = self.history[index].clone();
        let original = self
            .events
            .iter()
            .find(|e| e.id == target)
            .ok_or(ReviewError::Contract("review history birth"))?;
        if let Payload::Action(action) = &original.payload {
            Projection::build(&self.events)?.validate_action(
                &self.binding,
                action,
                Some(&self.policy),
                &event::clock(&self.events),
            )?;
        }
        let event = self.next(Payload::Visibility { target, visible: redo })?;
        let mut candidate = self.staged();
        candidate.events.push(event.clone());
        candidate.cursor = if redo { self.cursor + 1 } else { self.cursor - 1 };
        candidate.admit()?;
        self.adopt(candidate);
        Ok(ReviewOutcome::Committed(event.id))
    }
}

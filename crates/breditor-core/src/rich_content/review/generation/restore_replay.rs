//! Validate new archive events against an already verified prefix during cold restore.
use super::super::{
    ReviewActorId, ReviewError, ReviewSession,
    event::{self, Event},
    identity::Counter,
    replay::ReviewReplay,
};
use std::collections::BTreeMap;

pub(super) struct RestoreReplay {
    replay: ReviewReplay,
    positions: BTreeMap<ReviewActorId, Vec<usize>>,
}

impl RestoreReplay {
    pub(super) fn new(replay: ReviewReplay, root: &ReviewSession) -> Self {
        let mut positions = BTreeMap::<_, Vec<usize>>::new();
        for (position, event) in root.events.iter().enumerate() {
            positions.entry(event.id.actor.clone()).or_default().push(position);
        }
        Self { replay, positions }
    }

    pub(super) fn append_cut(
        &mut self,
        owner: &mut ReviewSession,
        events: Vec<Event>,
    ) -> Result<(), ReviewError> {
        let start = owner.events.len();
        for event in events {
            self.check_append_order(&owner.events, &event)?;
            self.positions.entry(event.id.actor.clone()).or_default().push(owner.events.len());
            owner.events.push(event);
        }
        if owner.events.len() > owner.event_limit() {
            return Err(ReviewError::Limit("events"));
        }
        self.validate_suffix(owner, start).or_else(|error| {
            // Malformed cuts can have independent invalid events. Use the
            // normal canonical pass to preserve which failure they report.
            owner.admit().and(Err(error))
        })
    }

    fn validate_suffix(&mut self, owner: &ReviewSession, start: usize) -> Result<(), ReviewError> {
        let suffix = &owner.events[start..];
        for event in suffix {
            if event.dependencies.len() > 1024 {
                return Err(ReviewError::Limit("causal actors"));
            }
            event::validate_causal_frontier(event, |actor, counter| {
                self.lookup(&owner.events, actor, counter)
            })?;
        }
        for event in suffix {
            self.replay.apply(&owner.binding, &owner.policy, event)?;
        }
        self.replay.check_history(owner)
    }

    fn check_append_order(&self, retained: &[Event], event: &Event) -> Result<(), ReviewError> {
        let previous = self
            .positions
            .get(&event.id.actor)
            .and_then(|stream| stream.last())
            .map_or(0, |&position| retained[position].id.counter.0);
        if previous.checked_add(1) != Some(event.id.counter.0)
            || event.dependencies.get(&event.id.actor).map_or(0, |c| c.0) != previous
        {
            return Err(ReviewError::Fork);
        }
        if event
            .dependencies
            .iter()
            .any(|(actor, counter)| self.lookup(retained, actor, *counter).is_none())
        {
            return Err(ReviewError::Contract("review generation append dependencies"));
        }
        Ok(())
    }

    fn lookup<'a>(
        &self,
        events: &'a [Event],
        actor: &ReviewActorId,
        counter: Counter,
    ) -> Option<&'a Event> {
        let index = usize::try_from(counter.0.checked_sub(1)?).ok()?;
        let position = *self.positions.get(actor)?.get(index)?;
        events.get(position)
    }
}

//! Validate new archive events against an already verified prefix during cold restore.
use super::super::{
    ReviewError, ReviewSession,
    event::{self, Event, EventPositions},
    replay::ReviewReplay,
};

pub(super) struct RestoreReplay {
    replay: ReviewReplay,
    positions: EventPositions,
}

impl RestoreReplay {
    pub(super) fn new(replay: ReviewReplay, root: &ReviewSession) -> Result<Self, ReviewError> {
        let positions = EventPositions::from_events(&root.events).ok_or(ReviewError::Fork)?;
        Ok(Self { replay, positions })
    }

    pub(super) fn append_cut(
        &mut self,
        owner: &mut ReviewSession,
        events: Vec<Event>,
    ) -> Result<(), ReviewError> {
        let start = owner.events.len();
        for event in events {
            self.check_append_order(&owner.events, &event)?;
            self.positions.record(&event.id, owner.events.len());
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
                self.positions.lookup(&owner.events, actor, counter)
            })?;
        }
        for event in suffix {
            self.replay.apply(&owner.binding, &owner.policy, event)?;
        }
        self.replay.check_history(owner)
    }

    fn check_append_order(&self, retained: &[Event], event: &Event) -> Result<(), ReviewError> {
        if !self.positions.continues(event) {
            return Err(ReviewError::Fork);
        }
        if event
            .dependencies
            .iter()
            .any(|(actor, counter)| self.positions.lookup(retained, actor, *counter).is_none())
        {
            return Err(ReviewError::Contract("review generation append dependencies"));
        }
        Ok(())
    }
}

//! Temporary lookup of contiguous actor streams in a retained event vector.
use super::{Counter, Event, ReviewActorId, ReviewEventId};
use std::collections::BTreeMap;

#[derive(Default)]
pub(in crate::rich_content::review) struct EventPositions(BTreeMap<ReviewActorId, Vec<usize>>);

impl EventPositions {
    pub(in crate::rich_content::review) fn from_events(events: &[Event]) -> Option<Self> {
        let mut positions = Self::default();
        for (position, event) in events.iter().enumerate() {
            if positions.next(&event.id.actor) != Some(event.id.counter.0) {
                return None;
            }
            positions.record(&event.id, position);
        }
        Some(positions)
    }

    pub(in crate::rich_content::review) fn through(
        &self,
        actor: &ReviewActorId,
    ) -> Option<Counter> {
        let count = self.0.get(actor)?.len();
        u64::try_from(count).ok().map(Counter)
    }

    fn next(&self, actor: &ReviewActorId) -> Option<u64> {
        self.through(actor).map_or(0, |counter| counter.0).checked_add(1)
    }

    pub(in crate::rich_content::review) fn continues(&self, event: &Event) -> bool {
        let actor = &event.id.actor;
        self.next(actor) == Some(event.id.counter.0)
            && self.through(actor).map_or(0, |counter| counter.0)
                == event.dependencies.get(actor).map_or(0, |counter| counter.0)
    }

    pub(in crate::rich_content::review) fn record(&mut self, id: &ReviewEventId, position: usize) {
        self.0.entry(id.actor.clone()).or_default().push(position);
    }

    pub(in crate::rich_content::review) fn lookup<'a>(
        &self,
        events: &'a [Event],
        actor: &ReviewActorId,
        counter: Counter,
    ) -> Option<&'a Event> {
        let index = usize::try_from(counter.0.checked_sub(1)?).ok()?;
        let position = *self.0.get(actor)?.get(index)?;
        events.get(position)
    }
}

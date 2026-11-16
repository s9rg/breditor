//! Canonical causal order with one waiting-list entry per blocked event.
use super::{Counter, Event, ReviewActorId, ReviewError, validate_causal_frontier};
use std::collections::{BTreeMap, btree_map};

type Position<'a> = (&'a ReviewActorId, Counter);
type Events<'a> = BTreeMap<Position<'a>, &'a Event>;

struct PendingEvent<'a> {
    event: &'a Event,
    remaining: btree_map::Iter<'a, ReviewActorId, Counter>,
}

#[derive(Default)]
struct Frontier<'a> {
    applied: BTreeMap<&'a ReviewActorId, Counter>,
    ready: Events<'a>,
    waiting: BTreeMap<Position<'a>, Vec<PendingEvent<'a>>>,
}

impl<'a> Frontier<'a> {
    fn schedule(&mut self, mut pending: PendingEvent<'a>) {
        // A validated actor prefix only advances. Already checked dependencies
        // can be discarded as the pending event moves to its next missing one.
        if let Some((actor, through)) = pending
            .remaining
            .find(|(actor, through)| self.applied.get(*actor).is_none_or(|seen| seen < *through))
        {
            // Old in-memory semantics require an actor to exist even when the
            // supplied counter is zero. Wire decoding still requires positives.
            self.waiting.entry((actor, (*through).max(Counter(1)))).or_default().push(pending);
        } else {
            let id = &pending.event.id;
            self.ready.insert((&id.actor, id.counter), pending.event);
        }
    }

    fn advance(&mut self, position: Position<'a>) {
        self.applied.insert(position.0, position.1);
        if let Some(waiting) = self.waiting.remove(&position) {
            for pending in waiting {
                self.schedule(pending);
            }
        }
    }
}

pub(in crate::rich_content::review) fn ordered(
    events: &[Event],
    limit: usize,
) -> Result<Vec<&Event>, ReviewError> {
    if events.len() > limit {
        return Err(ReviewError::Limit("events"));
    }
    let indexed: Events<'_> =
        events.iter().map(|event| ((&event.id.actor, event.id.counter), event)).collect();
    if indexed.len() != events.len() {
        return Err(ReviewError::Fork);
    }
    let mut frontier = Frontier::default();
    for event in events {
        frontier.schedule(PendingEvent { event, remaining: event.dependencies.iter() });
    }
    let mut result = Vec::with_capacity(events.len());
    // The smallest ready actor and counter are canonical, regardless of input order.
    while let Some((position, event)) = frontier.ready.pop_first() {
        let (actor, counter) = position;
        if event.dependencies.len() > 1024 {
            return Err(ReviewError::Limit("causal actors"));
        }
        let previous = frontier.applied.get(actor).map_or(0, |c| c.0);
        if previous.checked_add(1) != Some(counter.0)
            || event.dependencies.get(actor).map_or(0, |c| c.0) != previous
        {
            return Err(ReviewError::Fork);
        }
        validate_causal_frontier(event, |actor, through| indexed.get(&(actor, through)).copied())?;
        frontier.advance(position);
        result.push(event);
    }
    if result.len() != events.len() {
        return Err(ReviewError::Contract("missing or cyclic review dependencies"));
    }
    Ok(result)
}

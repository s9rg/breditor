//! Deterministic dependency-indexed topological order over missing source events.
use super::super::{
    ReviewError, ReviewEventId, ReviewSession,
    event::{self, Event},
};
use std::collections::{BTreeMap, BTreeSet};
pub(super) fn missing<'a>(
    current: &ReviewSession,
    source: &'a ReviewSession,
) -> Result<Vec<&'a Event>, ReviewError> {
    let held = current.events.iter().map(|event| &event.id).collect::<BTreeSet<_>>();
    let clock = event::clock(&current.events);
    let pending = source
        .events
        .iter()
        .filter(|event| !held.contains(&event.id))
        .map(|event| (&event.id, event))
        .collect::<BTreeMap<_, _>>();
    let mut counts = BTreeMap::new();
    let mut waiters = BTreeMap::<ReviewEventId, Vec<&ReviewEventId>>::new();
    let mut ready = BTreeSet::new();
    for (id, event) in &pending {
        let mut count = 0_usize;
        for (actor, through) in &event.dependencies {
            if clock.get(actor).is_none_or(|known| known < through) && through.0 > 0 {
                let dependency = ReviewEventId::try_new(actor.clone(), through.0)?;
                if !pending.contains_key(&dependency) {
                    return Err(ReviewError::Contract("review retained branch dependency absent"));
                }
                waiters.entry(dependency).or_default().push(id);
                count += 1;
            }
        }
        counts.insert(*id, count);
        if count == 0 {
            ready.insert(*id);
        }
    }
    let mut ordered = Vec::with_capacity(pending.len());
    while let Some(id) = ready.pop_first() {
        ordered.push(pending[id]);
        if let Some(rows) = waiters.remove(id) {
            for dependent in rows {
                let count = counts
                    .get_mut(dependent)
                    .ok_or(ReviewError::Contract("review retained branch dependency index"))?;
                *count = count
                    .checked_sub(1)
                    .ok_or(ReviewError::Contract("review retained branch dependency count"))?;
                if *count == 0 {
                    ready.insert(dependent);
                }
            }
        }
    }
    if ordered.len() != pending.len() {
        return Err(ReviewError::Contract("review retained branch causal cycle"));
    }
    Ok(ordered)
}

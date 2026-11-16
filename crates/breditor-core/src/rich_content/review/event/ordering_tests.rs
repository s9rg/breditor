//! The frontier optimization must retain the original causal admission and canonical order.
use super::*;
use proptest::prelude::*;

fn reference(events: &[Event], limit: usize) -> Result<Vec<&Event>, ReviewError> {
    if events.len() > limit {
        return Err(ReviewError::Limit("events"));
    }
    let mut waiting = events.iter().map(|e| (&e.id, e)).collect::<BTreeMap<_, _>>();
    if waiting.len() != events.len() {
        return Err(ReviewError::Fork);
    }
    let mut result: Vec<&Event> = vec![];
    let mut applied = Clock::new();
    while !waiting.is_empty() {
        let Some(id) = waiting
            .iter()
            .find(|(_, e)| {
                e.dependencies.iter().all(|(a, c)| applied.get(a).is_some_and(|seen| seen >= c))
            })
            .map(|(id, _)| (*id).clone())
        else {
            return Err(ReviewError::Contract("missing or cyclic review dependencies"));
        };
        let event = waiting.remove(&id).ok_or(ReviewError::Contract("review event order"))?;
        if event.dependencies.len() > 1024 {
            return Err(ReviewError::Limit("causal actors"));
        }
        let previous = applied.get(&id.actor).map_or(0, |c| c.0);
        if previous.checked_add(1) != Some(id.counter.0)
            || event.dependencies.get(&id.actor).map_or(0, |c| c.0) != previous
        {
            return Err(ReviewError::Fork);
        }
        for dependency in &result {
            if observes(&event.dependencies, &dependency.id)
                && dependency
                    .dependencies
                    .iter()
                    .any(|(a, c)| event.dependencies.get(a).is_none_or(|seen| seen < c))
            {
                return Err(ReviewError::Contract("nonclosed review causal frontier"));
            }
        }
        applied.insert(id.actor.clone(), id.counter);
        result.push(event);
    }
    Ok(result)
}

fn spelling(result: Result<Vec<&Event>, ReviewError>) -> Result<Vec<ReviewEventId>, String> {
    result.map(|v| v.into_iter().map(|e| e.id.clone()).collect()).map_err(|e| e.to_string())
}
fn vectors(spec: &[u8]) -> Result<Vec<Event>, ReviewError> {
    let mut events: Vec<Event> = vec![];
    for byte in spec {
        let actor = ReviewActorId::try_new(format!("actor-{}", byte % 4))?;
        let full = clock(&events);
        let previous = full.get(&actor).map_or(0, |n| n.0);
        let mut dependencies: Clock = full
            .into_iter()
            .filter(|(a, _)| {
                a == &actor || byte & (1 << (a.as_str().as_bytes()[6] - b'0' + 2)) != 0
            })
            .collect();
        loop {
            let before = dependencies.clone();
            for event in &events {
                if observes(&dependencies, &event.id) {
                    for (a, c) in &event.dependencies {
                        dependencies
                            .entry(a.clone())
                            .and_modify(|v| *v = (*v).max(*c))
                            .or_insert(*c);
                    }
                }
            }
            if before == dependencies {
                break;
            }
        }
        let id = ReviewEventId::try_new(actor, previous + 1)?;
        events.push(Event {
            id: id.clone(),
            principal: ReviewPrincipalId::try_new("fixture")?,
            dependencies,
            previous_digest: String::new(),
            payload: Payload::Visibility { target: id, visible: true },
        });
    }
    Ok(events)
}

proptest! {
    #[test]
    fn frontier_checks_match_the_preserved_full_past_scan(spec in prop::collection::vec(any::<u8>(), 0..64), point in any::<usize>(), corruption in 0_u8..10) {
        let mut events = vectors(&spec).map_err(|e| TestCaseError::fail(e.to_string()))?;
        if !events.is_empty() {
            let index = point % events.len();
            match corruption {
                1 => { events[index].dependencies.pop_first(); }
                2 => { events.push(events[index].clone()); }
                3 => { events[index].id.counter.0 += 2; }
                4 => { events[index].dependencies.insert(ReviewActorId::try_new("missing").map_err(|e| TestCaseError::fail(e.to_string()))?, Counter(1)); }
                5 => { events.reverse(); }
                6 => { let actor = events[0].id.actor.clone(); let last = events.len() - 1; events[last].dependencies.insert(actor, Counter(0)); }
                7 => { let id = events[index].id.clone(); events[index].dependencies.insert(id.actor, id.counter); }
                8 => { events.remove(index); }
                9 => { events.rotate_right(index); }
                _ => {}
            }
        }
        prop_assert_eq!(spelling(ordered(&events, MAX_EVENTS)), spelling(reference(&events, MAX_EVENTS)));
    }
}

#[test]
fn long_blocked_stream_wakes_at_its_prerequisite_and_regains_canonical_priority()
-> Result<(), ReviewError> {
    const HALF: u64 = 32_768;
    let early = ReviewActorId::try_new("a-blocked")?;
    let late = ReviewActorId::try_new("z-prerequisite")?;
    let principal = ReviewPrincipalId::try_new("fixture")?;
    let make_event = |actor: &ReviewActorId, counter: u64| -> Result<Event, ReviewError> {
        let mut dependencies = Clock::new();
        if counter > 1 {
            dependencies.insert(actor.clone(), Counter(counter - 1));
        }
        if actor == &early {
            dependencies.insert(late.clone(), Counter(HALF));
        }
        let id = ReviewEventId::try_new(actor.clone(), counter)?;
        Ok(Event {
            payload: Payload::Visibility { target: id.clone(), visible: true },
            id,
            principal: principal.clone(),
            dependencies,
            previous_digest: String::new(),
        })
    };
    let events = (1..HALF)
        .rev()
        .map(|counter| make_event(&early, counter))
        .chain((1..=HALF + 1).rev().map(|counter| make_event(&late, counter)))
        .collect::<Result<Vec<_>, _>>()?;
    let result = ordered(&events, events.len())?;
    let expected = (1..=HALF)
        .map(|counter| (&late, counter))
        .chain((1..HALF).map(|counter| (&early, counter)))
        .chain(std::iter::once((&late, HALF + 1)));
    assert!(result.iter().map(|event| (event.id.actor(), event.id.counter())).eq(expected));
    Ok(())
}

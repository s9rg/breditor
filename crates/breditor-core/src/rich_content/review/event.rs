//! Immutable review events and causal frontiers; writer policy is supplied outside these values.
use super::{
    ReviewActorId, ReviewBinding, ReviewError, ReviewEventId, ReviewPrincipalId,
    actions::ReviewAction, identity::Counter,
};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
pub(super) type Clock = BTreeMap<ReviewActorId, Counter>;
pub(super) const MAX_EVENTS: usize = 8192;
pub(super) const MAX_BYTES: usize = 16 * 1024 * 1024;
pub(super) const MAX_FRAME_BYTES: usize = 1024 * 1024;

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", content = "data", rename_all = "snake_case", deny_unknown_fields)]
/// The literal retained review action or an Undo/Redo visibility change.
pub enum Payload {
    /// An original attributed review action.
    Action(ReviewAction),
    /// An authenticated visibility operation referencing an earlier authored action.
    Visibility {
        /// Original action changed by this event.
        target: ReviewEventId,
        /// Whether the original contribution is visible again.
        visible: bool,
    },
}
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub(super) struct Event {
    pub id: ReviewEventId,
    pub principal: ReviewPrincipalId,
    pub dependencies: Clock,
    pub previous_digest: String,
    pub payload: Payload,
}
pub(super) fn digest(event: &Event) -> Result<String, ReviewError> {
    hash(b"breditor/review-event/1\0", &serde_json::to_vec(event)?)
}
pub(super) fn genesis(
    binding: &ReviewBinding,
    actor: &ReviewActorId,
    principal: &ReviewPrincipalId,
) -> Result<String, ReviewError> {
    hash(b"breditor/review-stream/1\0", &serde_json::to_vec(&(binding, actor, principal))?)
}
pub(super) fn hash(domain: &[u8], bytes: &[u8]) -> Result<String, ReviewError> {
    use sha2::{Digest, Sha256};
    use std::fmt::Write as _;
    let digest = Sha256::new().chain_update(domain).chain_update(bytes).finalize();
    let mut text = String::from("sha256:");
    for byte in digest {
        write!(text, "{byte:02x}").map_err(|_| ReviewError::Contract("review digest"))?;
    }
    Ok(text)
}
pub(super) fn observes(clock: &Clock, id: &ReviewEventId) -> bool {
    clock.get(&id.actor).is_some_and(|counter| *counter >= id.counter)
}
pub(super) fn clock(events: &[Event]) -> Clock {
    let mut result = Clock::new();
    for event in events {
        result
            .entry(event.id.actor.clone())
            .and_modify(|c| *c = (*c).max(event.id.counter))
            .or_insert(event.id.counter);
    }
    result
}
pub(super) fn ordered(events: &[Event], limit: usize) -> Result<Vec<&Event>, ReviewError> {
    if events.len() > limit {
        return Err(ReviewError::Limit("events"));
    }
    let mut waiting = events.iter().map(|e| (&e.id, e)).collect::<BTreeMap<_, _>>();
    if waiting.len() != events.len() {
        return Err(ReviewError::Fork);
    }
    let indexed = waiting.clone();
    let mut result: Vec<&Event> = Vec::with_capacity(events.len());
    let mut applied = Clock::new();
    while !waiting.is_empty() {
        let Some(id) = waiting
            .iter()
            .find(|(_, event)| {
                event.dependencies.iter().all(|(a, c)| applied.get(a).is_some_and(|seen| seen >= c))
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
        // Each accepted actor prefix already closes over its earlier events.
        // Checking the last observed event of each actor therefore proves the
        // same transitive closure without rescanning the entire retained past.
        for (actor, through) in &event.dependencies {
            if through.0 == 0 {
                continue;
            }
            let dependency = indexed
                .get(&ReviewEventId { actor: actor.clone(), counter: *through })
                .ok_or(ReviewError::Contract("nonclosed review causal frontier"))?;
            if dependency
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

#[cfg(test)]
mod ordering_tests;
pub(super) fn text(input: &str) -> Result<(), ReviewError> {
    if input.len() > 16 * 1024 {
        return Err(ReviewError::Limit("message bytes"));
    }
    if input.trim().is_empty() {
        return Err(ReviewError::Contract("empty message"));
    }
    Ok(())
}
pub(super) fn anchor(binding: &ReviewBinding, input: &str) -> Result<(), ReviewError> {
    if input.len() > 256 * 1024 {
        return Err(ReviewError::Limit("anchor bytes"));
    }
    let value: serde_json::Value = serde_json::from_str(input)?;
    if value["format"] != "breditor/shared-review-anchor"
        || value["formatVersion"] != 1
        || value["document"] != binding.document
        || value["schemaFingerprint"] != binding.schema_fingerprint
        || !value["anchors"].is_object()
    {
        return Err(ReviewError::Contract("native review anchor binding"));
    }
    // This metadata layer does not reinterpret a backend cursor. The actual document
    // owner must validate capture/reanchor payloads before composing publication.
    Ok(())
}

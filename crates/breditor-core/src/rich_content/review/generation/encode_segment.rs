//! Canonical active input suffix; late concurrent events never reorder earlier sealed files.
use super::{
    super::{ReviewError, ReviewSession, event},
    record::{SEGMENT_FORMAT, SegmentRef},
};

pub(super) fn encode_active(owner: &ReviewSession) -> Result<String, ReviewError> {
    let state = owner.generations.as_ref().ok_or(ReviewError::Contract("review history family"))?;
    let events = owner
        .events
        .get(state.active_start..)
        .ok_or(ReviewError::Contract("review generation offset"))?;
    if events.len() > event::MAX_EVENTS {
        return Err(ReviewError::Limit("review generation events"));
    }
    let (parent_generation, parent_sha256) = state.parent();
    let json = serde_json::to_string(&SegmentRef {
        format: SEGMENT_FORMAT,
        format_version: 1,
        generation: &state.active_generation,
        parent_generation,
        parent_sha256,
        event_offset: state.active_start,
        events,
        history: &owner.history,
        cursor: owner.cursor,
    })?;
    if json.len() > event::MAX_BYTES {
        return Err(ReviewError::Limit("review generation bytes"));
    }
    Ok(json)
}

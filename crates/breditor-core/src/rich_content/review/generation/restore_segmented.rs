//! Native semantic recovery of every retained event and each cut's author-local history.
//! Hashes select exact files; they never replace causal/action/Undo replay or current policy.
use super::{
    super::{ReviewActorPolicy, ReviewBinding, ReviewError, ReviewSession, event},
    encode_segment::encode_active,
    history::{ReviewGenerations, SealedReviewGeneration, file_digest},
    record::{
        ARCHIVE_FORMAT, Archive, CONTINUED_MAX_ARCHIVE_BYTES, MAX_ARCHIVE_BYTES, MAX_GENERATIONS,
        SEGMENT_FORMAT, Segment, check_budget, generation_id,
    },
};
use std::collections::BTreeSet;

impl ReviewSession {
    /// Restore only the explicitly selected segmented review family, under fresh host policy.
    /// Every sealed/active cut is replayed natively, including local Undo/Redo and peer events.
    /// # Errors
    /// Wrong identities/family, noncanonical files, forks, missing causal inputs, rewritten
    /// history, reused IDs and all byte/event/generation limits reject without an owner.
    pub fn restore_segmented_json(
        binding: &ReviewBinding,
        policy: ReviewActorPolicy,
        input: &str,
    ) -> Result<Self, ReviewError> {
        Self::restore_generation_json(binding, policy, input, false)
    }

    /// Restore the continued comment archive with fresh actor policy and exact V1 history.
    /// # Errors
    /// Invalid family, continuation boundary, identity, events, history or limits reject.
    pub fn restore_continued_json(
        binding: &ReviewBinding,
        policy: ReviewActorPolicy,
        input: &str,
    ) -> Result<Self, ReviewError> {
        Self::restore_generation_json(binding, policy, input, true)
    }

    fn restore_generation_json(
        binding: &ReviewBinding,
        policy: ReviewActorPolicy,
        input: &str,
        continued: bool,
    ) -> Result<Self, ReviewError> {
        let limit = if continued { CONTINUED_MAX_ARCHIVE_BYTES } else { MAX_ARCHIVE_BYTES };
        if input.len() > limit {
            return Err(ReviewError::Limit("review history archive bytes"));
        }
        let saved: Archive = serde_json::from_str(input)?;
        let version = if continued { 2 } else { 1 };
        if saved.format != ARCHIVE_FORMAT
            || saved.format_version != version
            || saved.continued_after.is_some() != continued
        {
            return Err(ReviewError::Contract("review history family"));
        }
        if saved.continued_after.is_some_and(|boundary| {
            boundary == 0 || boundary >= MAX_GENERATIONS || boundary > saved.sealed.len()
        }) {
            return Err(ReviewError::Contract("review continuation boundary"));
        }
        check_budget(saved.sealed.len() + 2, 0, continued)?;
        generation_id(&saved.root_generation)?;
        let mut ids = BTreeSet::from([saved.root_generation.clone()]);
        let mut owner = Self::restore_json(binding, policy, &saved.root)?;
        owner.generations = Some(ReviewGenerations::new(
            saved.root_generation,
            saved.root,
            String::new(),
            owner.events.len(),
        )?);
        for (index, json) in saved.sealed.iter().chain(std::iter::once(&saved.active)).enumerate() {
            if json.len() > event::MAX_BYTES {
                return Err(ReviewError::Limit("review generation bytes"));
            }
            let segment: Segment = serde_json::from_str(json)?;
            generation_id(&segment.generation)?;
            if !ids.insert(segment.generation.clone()) {
                return Err(ReviewError::Contract("reused review generation"));
            }
            let state =
                owner.generations.as_mut().ok_or(ReviewError::Contract("review history family"))?;
            let (parent, digest) = state.parent();
            if segment.format != SEGMENT_FORMAT
                || segment.format_version != 1
                || segment.parent_generation != parent
                || segment.parent_sha256 != digest
                || segment.event_offset != owner.events.len()
            {
                return Err(ReviewError::Contract("review generation lineage"));
            }
            if segment.events.len() > event::MAX_EVENTS {
                return Err(ReviewError::Limit("review generation events"));
            }
            let sealed = index < saved.sealed.len();
            let boundary = saved.continued_after;
            if sealed && segment.events.is_empty() && boundary != Some(index + 1) {
                return Err(ReviewError::Contract("empty review generation seal"));
            }
            if boundary == Some(index) {
                state.continued_after = boundary;
            }
            state.active_generation = segment.generation;
            state.active_start = owner.events.len();
            // Native append order is causal and actor-contiguous. Do not sort late
            // concurrent inputs back into an already retained segment or actor frame.
            let mut frontier = event::clock(&owner.events);
            for event in &segment.events {
                let previous = frontier.get(&event.id.actor).map_or(0, |c| c.0);
                if previous.checked_add(1) != Some(event.id.counter.0)
                    || event.dependencies.get(&event.id.actor).map_or(0, |c| c.0) != previous
                {
                    return Err(ReviewError::Fork);
                }
                if event
                    .dependencies
                    .iter()
                    .any(|(actor, counter)| frontier.get(actor).is_none_or(|known| known < counter))
                {
                    return Err(ReviewError::Contract("review generation append dependencies"));
                }
                frontier.insert(event.id.actor.clone(), event.id.counter);
            }
            owner.events.extend(segment.events);
            owner.history = segment.history;
            owner.cursor = segment.cursor;
            owner.admit()?;
            if encode_active(&owner)? != *json {
                return Err(ReviewError::Contract("canonical review generation"));
            }
            if sealed {
                let state = owner
                    .generations
                    .as_mut()
                    .ok_or(ReviewError::Contract("review history family"))?;
                state.sealed.push(SealedReviewGeneration {
                    generation: state.active_generation.clone(),
                    json: json.as_str().into(),
                    digest: file_digest(json)?,
                    start: state.active_start,
                    end: owner.events.len(),
                });
            }
        }
        let encoded = if continued {
            owner.continued_checkpoint_json()?
        } else {
            owner.segmented_checkpoint_json()?
        };
        if encoded != input {
            return Err(ReviewError::Contract("canonical segmented review recovery"));
        }
        Ok(owner)
    }
}

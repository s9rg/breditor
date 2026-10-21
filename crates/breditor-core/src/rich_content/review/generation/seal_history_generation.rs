//! Native lifecycle action review.history.seal/1. One nonempty active suffix becomes
//! immutable; a fresh empty successor preserves the exact event/history partition.
//! No document/selection/pending-format change or authored event occurs. Refusal is atomic.
use super::{
    super::{ReviewAccess, ReviewError, ReviewObservation, ReviewSession},
    encode_segment::encode_active,
    history::{SealedReviewGeneration, file_digest},
    record::{generation_budget, generation_id},
};

impl ReviewSession {
    /// Seal a nonempty comment generation without resetting counters, Undo or Redo.
    /// # Errors
    /// Stale/read-only/original owners, empty seals, reused IDs and capacity refuse unchanged.
    pub fn seal_history_generation_guarded(
        &mut self,
        observed: &ReviewObservation,
        next: String,
    ) -> Result<(), ReviewError> {
        seal(self, observed, next, false)
    }
}

pub(super) fn seal(
    owner: &mut ReviewSession,
    observed: &ReviewObservation,
    next: String,
    non_authoring: bool,
) -> Result<(), ReviewError> {
    owner.check(observed)?;
    if non_authoring {
        if owner.policy.access != ReviewAccess::ReadOnly
            || owner.local_writer_clock()?.through != "0"
        {
            return Err(ReviewError::Permission);
        }
    } else if owner.policy.access == ReviewAccess::ReadOnly {
        return Err(ReviewError::Permission);
    }
    generation_id(&next)?;
    let old = owner.generations.as_ref().ok_or(ReviewError::Contract("review history family"))?;
    if old.contains_id(&next) {
        return Err(ReviewError::Contract("reused review generation"));
    }
    if old.active_start == owner.events.len() {
        return Err(ReviewError::Contract("empty review generation seal"));
    }
    generation_budget(old.sealed.len() + 3, owner.events.len())?;
    let json = encode_active(owner)?;
    let digest = file_digest(&json)?;
    let mut candidate = owner.staged();
    let state =
        candidate.generations.as_mut().ok_or(ReviewError::Contract("review history family"))?;
    state.sealed.push(SealedReviewGeneration {
        generation: state.active_generation.clone(),
        json: json.into(),
        digest,
        start: state.active_start,
        end: owner.events.len(),
    });
    state.active_generation = next;
    state.active_start = owner.events.len();
    candidate.admit()?;
    owner.adopt(candidate);
    Ok(())
}

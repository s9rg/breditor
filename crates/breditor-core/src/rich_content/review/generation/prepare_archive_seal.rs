//! One immutable-file planner for author, strict-observer and read-only archive actions.
//! Policy/observation gates belong to those named actions; no prepared candidate is public.
use super::{
    super::{ReviewError, ReviewSession},
    encode_segment::encode_active,
    history::SealedReviewGeneration,
    record::{check_budget, generation_id},
};
pub(super) fn prepare(owner: &ReviewSession, next: String) -> Result<ReviewSession, ReviewError> {
    stage_seal(owner, next, false)
}

pub(super) fn stage_seal(
    owner: &ReviewSession,
    next: String,
    continuing: bool,
) -> Result<ReviewSession, ReviewError> {
    generation_id(&next)?;
    let old = owner.generations.as_ref().ok_or(ReviewError::Contract("review history family"))?;
    if old.contains_id(&next) {
        return Err(ReviewError::Contract("reused review generation"));
    }
    if continuing {
        owner.segmented_checkpoint_json()?;
    } else if old.active_start == owner.events.len() {
        return Err(ReviewError::Contract("empty review generation seal"));
    }
    check_budget(
        old.sealed.len() + 3,
        owner.events.len(),
        continuing || old.continued_after.is_some(),
    )?;
    let json = encode_active(owner)?;
    let mut candidate = owner.staged();
    let state =
        candidate.generations.as_mut().ok_or(ReviewError::Contract("review history family"))?;
    state.sealed.push(SealedReviewGeneration::new(
        state.active_generation.clone(),
        json.into(),
        state.active_start,
        owner.events.len(),
    )?);
    if continuing {
        state.continued_after = Some(state.sealed.len());
    }
    state.active_generation = next;
    state.active_start = owner.events.len();
    candidate.admit()?;
    Ok(candidate)
}

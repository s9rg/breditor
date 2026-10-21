//! One private payload/resource planner shared by the separately guarded lifecycle actions.
//! It borrows the admitted source and returns a private candidate; it publishes no grant or event.
use super::{
    super::{ReviewError, ReviewSession},
    history::ReviewGenerations,
    record::generation_id,
};
pub(super) fn prepare(
    owner: &ReviewSession,
    root: String,
    active: String,
) -> Result<ReviewSession, ReviewError> {
    if owner.generations.is_some() {
        return Err(ReviewError::Contract("review history already segmented"));
    }
    generation_id(&root)?;
    generation_id(&active)?;
    if root == active {
        return Err(ReviewError::Contract("reused review generation"));
    }
    let json = owner.checkpoint_json()?;
    let mut candidate = owner.staged();
    candidate.generations = Some(ReviewGenerations::new(root, json, active, owner.events.len())?);
    candidate.admit()?;
    Ok(candidate)
}

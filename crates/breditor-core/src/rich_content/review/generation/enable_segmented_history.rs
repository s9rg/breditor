//! Native lifecycle action review.history.enable/1: retain, never summarize, the old journal.
//! No event, document selection, pending format or history item changes. A successful
//! boundary invalidates the observation; stale/policy/identity/budget refusal is atomic.
use super::{
    super::{ReviewAccess, ReviewError, ReviewObservation, ReviewSession},
    history::ReviewGenerations,
    record::generation_id,
};

impl ReviewSession {
    /// Select explicit comment generations under current authoring policy.
    /// # Errors
    /// Stale guards, read-only policy, repeated enable, reused/malformed IDs or budgets reject.
    pub fn enable_segmented_history_guarded(
        &mut self,
        observed: &ReviewObservation,
        root: String,
        active: String,
    ) -> Result<(), ReviewError> {
        enable(self, observed, root, active, false)
    }
}

pub(super) fn enable(
    owner: &mut ReviewSession,
    observed: &ReviewObservation,
    root: String,
    active: String,
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
    owner.adopt(candidate);
    Ok(())
}

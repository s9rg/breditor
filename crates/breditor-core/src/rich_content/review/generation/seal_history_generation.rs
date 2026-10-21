//! Native lifecycle action review.history.seal/1. One nonempty active suffix becomes
//! immutable; a fresh empty successor preserves the exact event/history partition.
//! No document/selection/pending-format change or authored event occurs. Refusal is atomic.
use super::{
    super::{ReviewAccess, ReviewError, ReviewObservation, ReviewSession},
    prepare_archive_seal::prepare,
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
    let candidate = prepare(owner, next)?;
    owner.adopt(candidate);
    Ok(())
}

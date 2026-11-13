//! Explicit continuation of an admitted V1 comment history under the same actor.
use super::{
    super::{ReviewAccess, ReviewError, ReviewObservation, ReviewSession},
    prepare_archive_seal::stage_seal,
};

impl ReviewSession {
    /// Seal the V1 active comment file and start a larger bounded archive.
    /// Both Undo/Redo branches and original review event counters are retained.
    /// # Errors
    /// A stale guard, read-only policy, wrong family, reused ID or budget refuses unchanged.
    pub fn continue_history_guarded(
        &mut self,
        observed: &ReviewObservation,
        next: String,
    ) -> Result<(), ReviewError> {
        self.check(observed)?;
        if self.policy.access == ReviewAccess::ReadOnly {
            return Err(ReviewError::Permission);
        }
        let candidate = stage_seal(self, next, true)?;
        self.adopt(candidate);
        Ok(())
    }

    /// Continue a retained V1 comment archive while its current policy stays read-only.
    /// # Errors
    /// A stale guard, writable policy, wrong family, reused ID or budget refuses unchanged.
    pub fn continue_read_only_history_guarded(
        &mut self,
        observed: &ReviewObservation,
        next: String,
    ) -> Result<(), ReviewError> {
        self.check(observed)?;
        if self.policy.access != ReviewAccess::ReadOnly {
            return Err(ReviewError::Permission);
        }
        let candidate = stage_seal(self, next, true)?;
        self.adopt(candidate);
        Ok(())
    }
}

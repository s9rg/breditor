//! Lifecycle action `review.history.read_only_seal/1`: retain a nonempty suffix
//! without granting a former author current edit rights or consuming either history branch.
use super::{
    super::{ReviewAccess, ReviewError, ReviewObservation, ReviewSession},
    prepare_archive_seal::prepare,
};

impl ReviewSession {
    /// Seal actual retained inputs under current read-only policy, including a past local prefix.
    /// No new event, counter, selection, format, role or transport acknowledgement is authored.
    /// Original writable and zero-authored observer contracts remain separate and unchanged.
    /// # Errors
    /// Stale/foreign guards, writable policy, disabled mode, empty/reused/malformed
    /// generations and native resource limits reject atomically.
    pub fn seal_read_only_history_generation_guarded(
        &mut self,
        observed: &ReviewObservation,
        next: String,
    ) -> Result<(), ReviewError> {
        self.check(observed)?;
        if self.policy.access != ReviewAccess::ReadOnly {
            return Err(ReviewError::Permission);
        }
        let candidate = prepare(self, next)?;
        self.adopt(candidate);
        Ok(())
    }
}

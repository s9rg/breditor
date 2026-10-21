//! Lifecycle action `review.history.read_only_enable/1`: archive actual former-author
//! inputs under current read-only policy. No event, rights, counter or history reset.
use super::{
    super::{ReviewAccess, ReviewError, ReviewObservation, ReviewSession},
    prepare_archive_enable::prepare,
};

impl ReviewSession {
    /// Retain an exact original root while keeping a current read-only author read-only.
    /// Unlike the separate zero-authored observer action, past author history is permitted.
    /// This local boundary grants no authoring, transport or durable-storage authority.
    /// # Errors
    /// Stale/foreign guards, writable policy, existing mode, malformed/reused IDs or
    /// native replay/archive limits reject without publication or changing access.
    pub fn enable_read_only_segmented_history_guarded(
        &mut self,
        observed: &ReviewObservation,
        root: String,
        active: String,
    ) -> Result<(), ReviewError> {
        self.check(observed)?;
        if self.policy.access != ReviewAccess::ReadOnly {
            return Err(ReviewError::Permission);
        }
        let candidate = prepare(self, root, active)?;
        self.adopt(candidate);
        Ok(())
    }
}

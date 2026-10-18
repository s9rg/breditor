//! Pure publication guard for optional native read/intent boundaries.
use super::{RichLocalSession, RichLocalSessionError, RichLocalSnapshot};
impl RichLocalSession {
    /// Check an exact live publication before decoding an optional intention.
    /// Read-only observations are valid; this neither publishes nor changes history.
    /// # Errors
    /// Rejects a stale or foreign process-local observation, even for equal documents.
    pub fn check_observation(
        &self,
        snapshot: &RichLocalSnapshot,
    ) -> Result<(), RichLocalSessionError> {
        self.check(snapshot)
    }
}

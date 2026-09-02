use crate::local_log::LocalLogStorageAttemptId;

use super::{LocalLogStorageAttemptTransitionError, LocalLogStorageUncertainAttempt};

impl LocalLogStorageUncertainAttempt {
    /// Requires correlation with the currently retained physical attempt.
    ///
    /// Matching validates only opaque process-local identity. It does not
    /// classify terminal evidence, commit, noncommit, durability, currentness,
    /// authority, or owner release.
    ///
    /// # Errors
    ///
    /// Returns [`LocalLogStorageAttemptTransitionError::AttemptIdMismatch`]
    /// when `observed` belongs to an earlier retry or any other plan.
    pub fn require_current_attempt_id(
        &self,
        observed: &LocalLogStorageAttemptId,
    ) -> Result<(), LocalLogStorageAttemptTransitionError> {
        if self.attempt_id == *observed {
            Ok(())
        } else {
            Err(LocalLogStorageAttemptTransitionError::AttemptIdMismatch)
        }
    }
}

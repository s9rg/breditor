use crate::local_log::LocalLogStorageAttemptId;

use super::{LocalLogStorageRotationRetryEligibleAtResolution, LocalLogStorageUncertainAttempt};

impl LocalLogStorageRotationRetryEligibleAtResolution {
    /// Begins exact publication resubmission under a fresh attempt identity.
    ///
    /// The complete plan and its byte allocations are preserved. The new
    /// attempt still carries no storage authority and must repeat every
    /// comparison and acquire separate revocable publication authority.
    #[must_use = "exact resubmission becomes a fresh uncertain physical attempt"]
    pub fn begin_exact_resubmission(self) -> LocalLogStorageUncertainAttempt {
        LocalLogStorageUncertainAttempt::new(
            self.source.into_plan(),
            LocalLogStorageAttemptId::new(),
        )
    }
}

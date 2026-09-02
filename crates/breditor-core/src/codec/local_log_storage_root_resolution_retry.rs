use crate::local_log::LocalLogStorageAttemptId;

use super::{LocalLogStorageRootRetryEligibleAtResolution, LocalLogStorageUncertainAttempt};

impl LocalLogStorageRootRetryEligibleAtResolution {
    /// Begins one exact publication resubmission under a fresh attempt identity.
    ///
    /// The immutable transaction/head/generation identities and exact candidate
    /// allocation are preserved. This transition is available only after a
    /// completed clean-absence observation from a source that was not
    /// host-attested committed. It still grants no storage authority: a future
    /// adapter must repeat all comparisons and acquire separate revocable
    /// publication authority in its serialized transaction.
    #[must_use = "exact resubmission becomes a fresh uncertain physical attempt"]
    pub fn begin_exact_resubmission(self) -> LocalLogStorageUncertainAttempt {
        LocalLogStorageUncertainAttempt::new(
            self.source.into_plan(),
            LocalLogStorageAttemptId::new(),
        )
    }
}

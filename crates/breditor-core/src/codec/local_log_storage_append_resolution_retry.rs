use crate::local_log::LocalLogStorageAppendAttemptId;

use super::{
    LocalLogStorageAppendRetryEligibleAtResolution, LocalLogStorageUncertainAppendAttempt,
};

impl LocalLogStorageAppendRetryEligibleAtResolution {
    /// Begins one allocation-preserving exact-head resubmission.
    ///
    /// Every queue frame, `Arc` allocation, order, counter, limit, mutation
    /// token, expected binding, and final speculative cursor is preserved. Only
    /// a fresh append-attempt ID is created and one-shot append request
    /// eligibility is restored. Resolution evidence is a past snapshot: the
    /// token can already be stale, and an old copied dispatch may still commit.
    /// The future adapter must therefore repeat the complete serialized
    /// idempotent exact-head protocol.
    #[must_use = "exact resubmission becomes a fresh uncertain append attempt"]
    pub fn begin_exact_resubmission(self) -> LocalLogStorageUncertainAppendAttempt {
        LocalLogStorageUncertainAppendAttempt::new(
            self.source.into_queue(),
            LocalLogStorageAppendAttemptId::new(),
        )
    }
}

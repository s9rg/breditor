use crate::local_log::LocalLogStorageAppendAttemptId;

use super::LocalLogStorageUncertainAppendAttempt;

impl LocalLogStorageUncertainAppendAttempt {
    /// Begins an exact head resubmission with a fresh attempt identity.
    ///
    /// The complete queue, head and follower allocations, mutation token,
    /// speculative cursor, counters, limits, and expected binding remain
    /// unchanged. Only the volatile attempt ID changes and request eligibility
    /// resets. If the preceding attempt emitted a request, that transaction may
    /// still complete, so every actual invocation must use the serialized
    /// exact-head protocol.
    pub fn begin_exact_resubmission(mut self) -> Self {
        self.attempt_id = LocalLogStorageAppendAttemptId::new();
        self.request_id = None;
        self
    }
}

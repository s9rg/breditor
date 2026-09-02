use crate::local_log::LocalLogStorageAttemptId;

use super::LocalLogStorageUncertainAttempt;

impl LocalLogStorageUncertainAttempt {
    /// Begins an exact resubmission with one fresh physical-attempt identity.
    ///
    /// This consuming transition preserves the same closed plan allocation,
    /// including every candidate, selected-envelope byte, receipt, identity,
    /// head, fence, generation, frame, prefix, and checkpoint fact. The opaque
    /// process-local correlation identity is refreshed and one-shot request
    /// eligibility is reset. No replacement input is accepted.
    ///
    /// The earlier physical attempt may still commit. This state therefore
    /// remains `Uncertain`; a future adapter must serialize or idempotently
    /// handle overlapping exact attempts.
    pub fn begin_exact_resubmission(mut self) -> Self {
        self.attempt_id = LocalLogStorageAttemptId::new();
        self.request_issued = false;
        self
    }
}

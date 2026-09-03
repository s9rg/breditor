use crate::local_log::LocalLogStorageAppendAttemptId;

use super::{LocalLogStorageAppendAttemptAborted, LocalLogStorageUncertainAppendAttempt};

impl LocalLogStorageAppendAttemptAborted {
    /// Begins an allocation-preserving exact resubmission under a fresh identity.
    ///
    /// The complete queue, exact head and follower allocations, token, limits,
    /// counters, and final speculative cursor remain unchanged. This does not
    /// refresh a stale token. An uncorrelated copied dispatch may still commit,
    /// so the next adapter invocation must repeat the exact serialized tail and
    /// same-key/same-bytes protocol.
    pub fn begin_exact_resubmission(self) -> LocalLogStorageUncertainAppendAttempt {
        let (queue, _) = self.retained.into_parts();
        LocalLogStorageUncertainAppendAttempt::new(queue, LocalLogStorageAppendAttemptId::new())
    }
}

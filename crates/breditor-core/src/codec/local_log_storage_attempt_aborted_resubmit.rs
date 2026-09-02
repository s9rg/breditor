use crate::local_log::LocalLogStorageAttemptId;

use super::{LocalLogStorageAttemptAborted, LocalLogStorageUncertainAttempt};

impl LocalLogStorageAttemptAborted {
    /// Begins an exact resubmission with a fresh physical-attempt identity.
    ///
    /// This preserves the exact closed plan allocations and bytes. It does not
    /// upgrade the abort into plan-level noncommit: an uncorrelated copied
    /// transaction may still commit. Once the fresh ID is installed, a
    /// callback carrying the old ID is stale, while any copied transaction's
    /// effects must be handled by later storage resolution.
    pub fn begin_exact_resubmission(self) -> LocalLogStorageUncertainAttempt {
        let plan = self.retained.into_plan();
        LocalLogStorageUncertainAttempt::new(plan, LocalLogStorageAttemptId::new())
    }
}

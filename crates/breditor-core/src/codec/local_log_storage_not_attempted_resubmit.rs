use crate::local_log::LocalLogStorageAttemptId;

use super::{LocalLogStorageNotAttempted, LocalLogStorageUncertainAttempt};

impl LocalLogStorageNotAttempted {
    /// Begins an exact resubmission with a fresh physical-attempt identity.
    ///
    /// The complete closed plan allocation and every retained byte are reused.
    /// This action grants no authority and accepts no replacement input.
    pub fn begin_exact_resubmission(self) -> LocalLogStorageUncertainAttempt {
        let plan = self.retained.into_plan();
        LocalLogStorageUncertainAttempt::new(plan, LocalLogStorageAttemptId::new())
    }
}

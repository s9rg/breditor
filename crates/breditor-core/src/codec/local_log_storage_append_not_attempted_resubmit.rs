use crate::local_log::LocalLogStorageAppendAttemptId;

use super::{LocalLogStorageAppendNotAttempted, LocalLogStorageUncertainAppendAttempt};

impl LocalLogStorageAppendNotAttempted {
    /// Begins an allocation-preserving exact resubmission under a fresh identity.
    ///
    /// The complete queue and all retained allocations remain unchanged. This
    /// grants no renewed writer authority and accepts no replacement input.
    pub fn begin_exact_resubmission(self) -> LocalLogStorageUncertainAppendAttempt {
        LocalLogStorageUncertainAppendAttempt::new(
            self.retained.into_queue(),
            LocalLogStorageAppendAttemptId::new(),
        )
    }
}

use crate::local_log::LocalLogStorageAttemptId;

use super::{LocalLogStoragePreparedAttempt, LocalLogStorageUncertainAttempt};

impl LocalLogStoragePreparedAttempt {
    /// Conservatively begins one physical attempt before request egress.
    ///
    /// This consuming transition creates a fresh opaque process-local attempt
    /// identity and moves the complete exact plan to `Uncertain`. Only the
    /// resulting state can expose a payload-bearing adapter request. The
    /// transition itself performs no I/O and does not prove that bytes were
    /// copied, dispatched, observed, committed, aborted, or made durable.
    pub fn begin_attempt(self) -> LocalLogStorageUncertainAttempt {
        LocalLogStorageUncertainAttempt::new(self.plan, LocalLogStorageAttemptId::new())
    }
}

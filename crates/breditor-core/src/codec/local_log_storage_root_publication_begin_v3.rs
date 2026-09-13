use crate::local_log::LocalLogStorageAttemptId;

use super::{LocalLogStorageRootPublicationAttemptV3, LocalLogStorageRootPublicationPlanV3};

impl LocalLogStorageRootPublicationPlanV3 {
    /// Consumes preparation into uncertainty before any payload can leave.
    ///
    /// This allocates only volatile correlation, not a transaction or writer.
    /// Dropping the owner, cancellation, or timeout proves no storage outcome.
    #[must_use = "retain the uncertain owner until a terminal claim can be correlated"]
    pub fn begin_attempt(self) -> LocalLogStorageRootPublicationAttemptV3 {
        LocalLogStorageRootPublicationAttemptV3 {
            plan: self,
            attempt_id: LocalLogStorageAttemptId::new(),
            request_id: None,
        }
    }
}

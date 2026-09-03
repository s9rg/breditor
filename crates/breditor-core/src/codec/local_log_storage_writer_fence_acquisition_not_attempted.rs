use std::fmt;

use crate::local_log::{
    LocalLogStorageFenceId, LocalLogStorageWriterEpoch,
    LocalLogStorageWriterFenceAcquisitionAttemptId,
};

use super::{
    LocalLogStorageMutationFenceBinding,
    local_log_storage_retained_writer_fence_acquisition::LocalLogStorageRetainedWriterFenceAcquisition,
};

/// An acquisition invocation attested to have created no transaction.
///
/// This is invocation-local evidence, not proof that the plan never changed
/// storage. If its request was exposed, copied request data may have escaped
/// the one-request/one-transaction contract. The state grants no authority and
/// accepts only exact resubmission.
///
/// ```compile_fail
/// fn require_clone<T: Clone>() {}
/// require_clone::<breditor_core::codec::LocalLogStorageWriterFenceAcquisitionNotAttempted>();
/// ```
#[must_use = "a not-attempted acquisition remains a non-authoritative exact plan"]
pub struct LocalLogStorageWriterFenceAcquisitionNotAttempted {
    pub(super) retained: LocalLogStorageRetainedWriterFenceAcquisition,
}

impl LocalLogStorageWriterFenceAcquisitionNotAttempted {
    pub(super) const fn new(retained: LocalLogStorageRetainedWriterFenceAcquisition) -> Self {
        Self { retained }
    }

    /// Returns the closed physical acquisition-attempt identity.
    #[must_use]
    pub const fn attempt_id(&self) -> &LocalLogStorageWriterFenceAcquisitionAttemptId {
        self.retained.attempt_id()
    }

    /// Returns whether this invocation exposed its adapter request.
    #[must_use]
    pub const fn request_issued(&self) -> bool {
        self.retained.request_issued()
    }

    /// Returns the exact expected pre-acquisition binding.
    #[must_use]
    pub const fn expected_binding(&self) -> &LocalLogStorageMutationFenceBinding {
        self.retained.plan().expected_binding()
    }

    /// Returns the planned successor writer epoch.
    #[must_use]
    pub const fn next_writer_epoch(&self) -> LocalLogStorageWriterEpoch {
        self.retained.plan().next_writer_epoch()
    }

    /// Returns the proposed current writer fence.
    #[must_use]
    pub const fn proposed_writer_fence_id(&self) -> &LocalLogStorageFenceId {
        self.retained.plan().proposed_writer_fence_id()
    }
}

impl fmt::Debug for LocalLogStorageWriterFenceAcquisitionNotAttempted {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("LocalLogStorageWriterFenceAcquisitionNotAttempted")
            .field("attempt_id", self.attempt_id())
            .field("request_issued", &self.request_issued())
            .field("plan", self.retained.plan())
            .finish_non_exhaustive()
    }
}

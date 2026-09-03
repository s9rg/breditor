use std::fmt;

use crate::local_log::{
    LocalLogStorageFenceId, LocalLogStorageWriterEpoch,
    LocalLogStorageWriterFenceAcquisitionAttemptId, LocalLogStorageWriterFenceAcquisitionRequestId,
};

use super::{
    LocalLogStorageMutationFenceBinding,
    local_log_storage_issued_writer_fence_acquisition::LocalLogStorageIssuedWriterFenceAcquisition,
};

/// An exact acquisition plan after its correlated transaction aborted.
///
/// The abort closes only the associated physical transaction. It is not proof
/// that a copied uncorrelated dispatch made no storage change. This state has
/// consumed its terminal event and can only begin an exact resubmission.
///
/// ```compile_fail
/// fn require_clone<T: Clone>() {}
/// require_clone::<breditor_core::codec::LocalLogStorageWriterFenceAcquisitionAborted>();
/// ```
#[must_use = "an aborted acquisition plan remains retryable but grants no authority"]
pub struct LocalLogStorageWriterFenceAcquisitionAborted {
    pub(super) retained: LocalLogStorageIssuedWriterFenceAcquisition,
}

impl LocalLogStorageWriterFenceAcquisitionAborted {
    pub(super) const fn new(retained: LocalLogStorageIssuedWriterFenceAcquisition) -> Self {
        Self { retained }
    }

    /// Returns the closed physical acquisition-attempt identity.
    #[must_use]
    pub const fn attempt_id(&self) -> &LocalLogStorageWriterFenceAcquisitionAttemptId {
        self.retained.attempt_id()
    }

    /// Returns the emitted request identity whose transaction aborted.
    #[must_use]
    pub const fn request_id(&self) -> &LocalLogStorageWriterFenceAcquisitionRequestId {
        self.retained.request_id()
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

impl fmt::Debug for LocalLogStorageWriterFenceAcquisitionAborted {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("LocalLogStorageWriterFenceAcquisitionAborted")
            .field("attempt_id", self.attempt_id())
            .field("request_id", self.request_id())
            .field("plan", self.retained.plan())
            .finish_non_exhaustive()
    }
}

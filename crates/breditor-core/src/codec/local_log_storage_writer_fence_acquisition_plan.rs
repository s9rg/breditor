use std::fmt;

use crate::local_log::{LocalLogStorageFenceId, LocalLogStorageWriterEpoch};

use super::LocalLogStorageMutationFenceBinding;

/// Checked non-authority plan for one atomic writer-fence acquisition.
///
/// The plan binds an exact expected mutation envelope to exactly the next
/// nonwrapping writer epoch and a proposed current writer fence distinct from
/// the expected current fence. It performs no I/O and is neither a request,
/// commit receipt, currentness proof, revocable writer token, nor capability.
/// A future request-correlated transition must retain this plan until terminal
/// transaction evidence before it may issue mutation authority.
///
/// The plan is deliberately non-`Clone` in preparation for a later consuming
/// request lifecycle. That is ownership hygiene only: callers can reconstruct
/// equivalent non-secret inputs, and only a future opaque request identity can
/// establish unambiguous process-local correlation.
/// In particular, two contenders may prepare the same next epoch and proposed
/// fence. A future terminal callback must correlate the exact emitted request;
/// the observed epoch/fence tuple alone cannot attribute which contender won.
///
/// ```compile_fail
/// fn require_clone<T: Clone>() {}
/// require_clone::<breditor_core::codec::LocalLogStorageWriterFenceAcquisitionPlan>();
/// ```
#[must_use = "a writer-fence acquisition plan must be explicitly handled"]
#[derive(Eq, PartialEq)]
pub struct LocalLogStorageWriterFenceAcquisitionPlan {
    expected_binding: LocalLogStorageMutationFenceBinding,
    next_writer_epoch: LocalLogStorageWriterEpoch,
    proposed_writer_fence_id: LocalLogStorageFenceId,
}

impl LocalLogStorageWriterFenceAcquisitionPlan {
    /// Closes values already checked by the acquisition preparation action.
    pub(super) const fn new(
        expected_binding: LocalLogStorageMutationFenceBinding,
        next_writer_epoch: LocalLogStorageWriterEpoch,
        proposed_writer_fence_id: LocalLogStorageFenceId,
    ) -> Self {
        Self { expected_binding, next_writer_epoch, proposed_writer_fence_id }
    }

    /// Returns the exact binding that an acquisition transaction must match.
    #[must_use]
    pub const fn expected_binding(&self) -> &LocalLogStorageMutationFenceBinding {
        &self.expected_binding
    }

    /// Returns the exact successor epoch that the transaction must store.
    #[must_use]
    pub const fn next_writer_epoch(&self) -> LocalLogStorageWriterEpoch {
        self.next_writer_epoch
    }

    /// Returns the proposed current writer fence that the transaction must store.
    #[must_use]
    pub const fn proposed_writer_fence_id(&self) -> &LocalLogStorageFenceId {
        &self.proposed_writer_fence_id
    }
}

impl fmt::Debug for LocalLogStorageWriterFenceAcquisitionPlan {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("LocalLogStorageWriterFenceAcquisitionPlan")
            .field("expected_binding", &self.expected_binding)
            .field("next_writer_epoch", &self.next_writer_epoch)
            .field("proposed_writer_fence_id", &self.proposed_writer_fence_id)
            .finish_non_exhaustive()
    }
}

use std::fmt;

use crate::local_log::{
    LocalLogStorageFenceId, LocalLogStorageWriterEpoch,
    LocalLogStorageWriterFenceAcquisitionAttemptId, LocalLogStorageWriterFenceAcquisitionRequestId,
};

use super::{
    LocalLogStorageMutationFenceBinding, LocalLogStorageSelectedBinding,
    LocalLogStorageWriterFenceAcquisitionPlan,
};

/// One exact writer-fence acquisition plan conservatively associated with an attempt.
///
/// Entering this state happens before request egress. It therefore cannot
/// distinguish an invocation that never reached storage from one whose
/// completion callback was lost. A matching terminal attestation consumes the
/// state. Exact resubmission preserves the closed plan, creates a fresh
/// process-local attempt identity, and restores one-shot request eligibility.
///
/// This non-`Clone` typestate is not writer authority. A transaction-complete
/// attestation for the exact emitted request is required before the core can
/// issue a [`LocalLogStorageMutationToken`](super::LocalLogStorageMutationToken).
///
/// ```compile_fail
/// fn require_clone<T: Clone>() {}
/// require_clone::<
///     breditor_core::codec::LocalLogStorageUncertainWriterFenceAcquisition,
/// >();
/// ```
///
/// A borrowed request cannot outlive this owner:
///
/// ```compile_fail
/// fn escape(
///     owner: &mut breditor_core::codec::LocalLogStorageUncertainWriterFenceAcquisition,
/// ) -> breditor_core::codec::LocalLogStorageWriterFenceAcquisitionRequest<'static> {
///     match owner.adapter_request() {
///         Ok(request) => request,
///         Err(_) => loop {},
///     }
/// }
/// ```
///
/// A live request borrow prevents consuming the owner for resubmission:
///
/// ```compile_fail
/// fn conflict(
///     mut owner: breditor_core::codec::LocalLogStorageUncertainWriterFenceAcquisition,
/// ) {
///     let Ok(request) = owner.adapter_request() else { return };
///     let _retry = owner.begin_exact_resubmission();
///     drop(request);
/// }
/// ```
///
/// The same borrow prevents consuming a terminal attestation:
///
/// ```compile_fail
/// fn terminal(
///     mut owner: breditor_core::codec::LocalLogStorageUncertainWriterFenceAcquisition,
/// ) {
///     let Ok(request) = owner.adapter_request() else { return };
///     let attestation =
///         breditor_core::codec::LocalLogStorageWriterFenceAcquisitionTerminalAttestation::
///             acquisition_completed(request.request_id());
///     let _outcome = owner.observe_terminal_attestation(attestation);
///     drop(request);
/// }
/// ```
#[must_use = "an uncertain writer-fence acquisition must be retained, attested, or resubmitted"]
pub struct LocalLogStorageUncertainWriterFenceAcquisition {
    pub(super) plan: LocalLogStorageWriterFenceAcquisitionPlan,
    pub(super) attempt_id: LocalLogStorageWriterFenceAcquisitionAttemptId,
    pub(super) request_id: Option<LocalLogStorageWriterFenceAcquisitionRequestId>,
}

impl LocalLogStorageUncertainWriterFenceAcquisition {
    pub(super) const fn new(
        plan: LocalLogStorageWriterFenceAcquisitionPlan,
        attempt_id: LocalLogStorageWriterFenceAcquisitionAttemptId,
    ) -> Self {
        Self { plan, attempt_id, request_id: None }
    }

    /// Returns the current physical acquisition-attempt identity.
    #[must_use]
    pub const fn attempt_id(&self) -> &LocalLogStorageWriterFenceAcquisitionAttemptId {
        &self.attempt_id
    }

    /// Returns whether this attempt already yielded its one adapter request.
    #[must_use]
    pub const fn request_issued(&self) -> bool {
        self.request_id.is_some()
    }

    /// Returns the exact pre-acquisition binding the transaction must match.
    #[must_use]
    pub const fn expected_binding(&self) -> &LocalLogStorageMutationFenceBinding {
        self.plan.expected_binding()
    }

    /// Returns the complete selected binding retained by the plan.
    #[must_use]
    pub const fn selected_binding(&self) -> &LocalLogStorageSelectedBinding {
        self.expected_binding().selected_binding()
    }

    /// Returns the exact successor writer epoch the transaction must store.
    #[must_use]
    pub const fn next_writer_epoch(&self) -> LocalLogStorageWriterEpoch {
        self.plan.next_writer_epoch()
    }

    /// Returns the proposed current writer fence the transaction must store.
    #[must_use]
    pub const fn proposed_writer_fence_id(&self) -> &LocalLogStorageFenceId {
        self.plan.proposed_writer_fence_id()
    }

    /// Returns the exact current-selection JSON byte length.
    #[must_use]
    pub fn current_selection_json_bytes(&self) -> usize {
        self.expected_binding().current_selection_json_bytes()
    }

    /// Returns the exact predecessor-selection JSON byte length when present.
    #[must_use]
    pub fn predecessor_selection_json_bytes(&self) -> Option<usize> {
        self.expected_binding().predecessor_selection_json_bytes()
    }
}

impl fmt::Debug for LocalLogStorageUncertainWriterFenceAcquisition {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("LocalLogStorageUncertainWriterFenceAcquisition")
            .field("attempt_id", &self.attempt_id)
            .field("request_issued", &self.request_issued())
            .field("plan", &self.plan)
            .finish_non_exhaustive()
    }
}

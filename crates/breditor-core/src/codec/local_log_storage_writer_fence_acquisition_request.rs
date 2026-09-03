use std::fmt;

use crate::local_log::{
    LocalLogStorageFenceId, LocalLogStorageWriterEpoch,
    LocalLogStorageWriterFenceAcquisitionAttemptId, LocalLogStorageWriterFenceAcquisitionRequestId,
};

use super::{
    LocalLogStorageMutationFenceBinding, LocalLogStorageSelectedBinding,
    LocalLogStorageWriterFenceAcquisitionPlan,
};

/// Borrowed adapter request for one exact writer-fence acquisition transaction.
///
/// The host must use one fixed-scope serialized read-write transaction to read
/// and independently normalize the complete selected envelope, including its
/// authoritative current-head index; compare the expected binding
/// directionally and both exact JSON values byte-for-byte; compare the expected
/// epoch and fence; and then store exactly the planned successor epoch and
/// proposed fence. The transaction must not change the selected head,
/// publication transaction, generation, or retained JSON.
///
/// Under `IndexedDB` Storage Profile V1 this means a strict `readwrite`
/// transaction over exactly `meta`, `scopes`, `transactions`, `generations`,
/// and `chunks`. The `chunks` store participates in serialization but requires
/// no range scan for acquisition. The adapter must explicitly abort on every
/// failed read, normalization, comparison, or write request. A comparison-
/// failed read-only transaction must never be allowed to emit a success-shaped
/// terminal event. Scope update success or `commit()` return is not terminal
/// completion; only the associated transaction's `complete` event is.
///
/// One request identity describes one physical transaction. A copied request
/// dispatched twice violates that contract and cannot be detected by safe
/// Rust. In particular, finding the proposed writer pair already stored is not
/// successful acquisition: another value-identical contender may have written
/// it. Only this exact transaction's `complete` event can attest acquisition.
///
/// The raw JSON may contain document data. It is intentionally available only
/// through this borrowed egress view and is omitted from diagnostics.
///
/// ```compile_fail
/// fn require_clone<T: Clone>() {}
/// require_clone::<
///     breditor_core::codec::LocalLogStorageWriterFenceAcquisitionRequest<'static>,
/// >();
/// ```
#[must_use = "a borrowed acquisition request is intended for one adapter invocation"]
pub struct LocalLogStorageWriterFenceAcquisitionRequest<'a> {
    plan: &'a LocalLogStorageWriterFenceAcquisitionPlan,
    request_id: &'a LocalLogStorageWriterFenceAcquisitionRequestId,
}

impl<'a> LocalLogStorageWriterFenceAcquisitionRequest<'a> {
    pub(super) const fn from_plan(
        plan: &'a LocalLogStorageWriterFenceAcquisitionPlan,
        request_id: &'a LocalLogStorageWriterFenceAcquisitionRequestId,
    ) -> Self {
        Self { plan, request_id }
    }

    /// Returns the physical acquisition attempt that emitted this request.
    #[must_use]
    pub const fn attempt_id(&self) -> &'a LocalLogStorageWriterFenceAcquisitionAttemptId {
        self.request_id.attempt_id()
    }

    /// Returns the correlation identity required by transaction terminal attestations.
    #[must_use]
    pub const fn request_id(&self) -> &'a LocalLogStorageWriterFenceAcquisitionRequestId {
        self.request_id
    }

    /// Returns the complete exact pre-acquisition mutation-fence binding.
    #[must_use]
    pub const fn expected_binding(&self) -> &'a LocalLogStorageMutationFenceBinding {
        self.plan.expected_binding()
    }

    /// Returns the complete selected-envelope scalar binding to re-observe.
    #[must_use]
    pub const fn selected_binding(&self) -> &'a LocalLogStorageSelectedBinding {
        self.expected_binding().selected_binding()
    }

    /// Returns the exact canonical currently selected root-or-rotation JSON.
    #[must_use]
    pub fn current_selection_json(&self) -> &'a str {
        self.expected_binding().current_selection_json()
    }

    /// Returns the exact immediate-predecessor JSON when selection is a rotation.
    #[must_use]
    pub fn predecessor_selection_json(&self) -> Option<&'a str> {
        self.expected_binding().predecessor_selection_json()
    }

    /// Returns the mutable writer epoch the transaction must initially observe.
    #[must_use]
    pub const fn expected_writer_epoch(&self) -> LocalLogStorageWriterEpoch {
        self.expected_binding().writer_epoch()
    }

    /// Returns the mutable writer fence the transaction must initially observe.
    #[must_use]
    pub const fn expected_writer_fence_id(&self) -> &'a LocalLogStorageFenceId {
        self.expected_binding().current_writer_fence_id()
    }

    /// Returns the exact successor writer epoch the transaction must store.
    #[must_use]
    pub const fn next_writer_epoch(&self) -> LocalLogStorageWriterEpoch {
        self.plan.next_writer_epoch()
    }

    /// Returns the exact new current writer fence the transaction must store.
    #[must_use]
    pub const fn proposed_writer_fence_id(&self) -> &'a LocalLogStorageFenceId {
        self.plan.proposed_writer_fence_id()
    }

    /// Returns the UTF-8 byte length of the exact current selection.
    #[must_use]
    pub fn current_selection_json_bytes(&self) -> usize {
        self.current_selection_json().len()
    }

    /// Returns the exact predecessor byte length when one is present.
    #[must_use]
    pub fn predecessor_selection_json_bytes(&self) -> Option<usize> {
        self.predecessor_selection_json().map(str::len)
    }
}

impl fmt::Debug for LocalLogStorageWriterFenceAcquisitionRequest<'_> {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("LocalLogStorageWriterFenceAcquisitionRequest")
            .field("attempt_id", self.attempt_id())
            .field("request_id", self.request_id)
            .field("selected_binding", self.selected_binding())
            .field("current_selection_json_bytes", &self.current_selection_json_bytes())
            .field("predecessor_selection_json_bytes", &self.predecessor_selection_json_bytes())
            .field("expected_writer_epoch", &self.expected_writer_epoch())
            .field("expected_writer_fence_id", self.expected_writer_fence_id())
            .field("next_writer_epoch", &self.next_writer_epoch())
            .field("proposed_writer_fence_id", self.proposed_writer_fence_id())
            .finish_non_exhaustive()
    }
}

use std::fmt;

use crate::local_log::{LocalLogStorageAppendAttemptId, LocalLogStorageAppendRequestId};

use super::{
    LocalLogStorageAppendQueue, LocalLogStorageMutationFenceBinding, LocalLogStorageSelectedBinding,
};

/// One exact FIFO-head append conservatively associated with a physical attempt.
///
/// Entering this state happens before request egress. The state therefore does
/// not distinguish an attempt that never reached storage from one whose
/// transaction committed but whose terminal callback was lost. The queue and
/// its immutable head remain owned here throughout that uncertainty.
///
/// The first adapter request borrows this owner and permanently records request
/// egress for the current attempt. Exact resubmission preserves the complete
/// queue, including every retained allocation and speculative successor, while
/// creating a fresh attempt identity and restoring one-shot request
/// eligibility. An earlier transaction may still complete, so resubmission
/// remains uncertain and must use the same serialized exact-head protocol.
///
/// This version intentionally has no terminal observation or head-removal API.
/// Neither constructing, inspecting, dropping, nor resubmitting this owner
/// acknowledges an append, proves storage currentness, or releases a durable
/// cursor.
///
/// ```compile_fail
/// fn require_clone<T: Clone>() {}
/// require_clone::<breditor_core::codec::LocalLogStorageUncertainAppendAttempt>();
/// ```
///
/// The volatile owner has no persistence representation:
///
/// ```compile_fail
/// fn serialize(owner: &breditor_core::codec::LocalLogStorageUncertainAppendAttempt) {
///     let _ = serde_json::to_string(owner);
/// }
/// ```
///
/// A borrowed request cannot outlive this owner:
///
/// ```compile_fail
/// fn escape(
///     owner: &mut breditor_core::codec::LocalLogStorageUncertainAppendAttempt,
/// ) -> breditor_core::codec::LocalLogStorageAppendRequest<'static> {
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
/// fn conflict(mut owner: breditor_core::codec::LocalLogStorageUncertainAppendAttempt) {
///     let Ok(request) = owner.adapter_request() else { return };
///     let _retry = owner.begin_exact_resubmission();
///     drop(request);
/// }
/// ```
///
/// The same live borrow prevents a consuming logical enqueue:
///
/// ```compile_fail
/// fn enqueue_conflict(
///     mut owner: breditor_core::codec::LocalLogStorageUncertainAppendAttempt,
///     entry: &breditor_core::local_log::LocalLogEntry,
/// ) {
///     let Ok(request) = owner.adapter_request() else { return };
///     let _step = owner.try_enqueue(entry);
///     drop(request);
/// }
/// ```
///
/// Raw head bytes remain available only through the borrowed adapter request:
///
/// ```compile_fail
/// fn expose(owner: &breditor_core::codec::LocalLogStorageUncertainAppendAttempt) -> &[u8] {
///     owner.head_frame()
/// }
/// ```
///
/// Uncertainty cannot be erased by recovering the plain queue:
///
/// ```compile_fail
/// fn erase(owner: breditor_core::codec::LocalLogStorageUncertainAppendAttempt) {
///     let _queue = owner.into_queue();
/// }
/// ```
#[must_use = "an uncertain append attempt owns the queue until explicitly transitioned"]
pub struct LocalLogStorageUncertainAppendAttempt {
    pub(super) queue: LocalLogStorageAppendQueue,
    pub(super) attempt_id: LocalLogStorageAppendAttemptId,
    pub(super) request_id: Option<LocalLogStorageAppendRequestId>,
}

/// Complete core-private parts of one uncertain append attempt.
///
/// Named parts keep ownership recovery explicit for consuming queue operations
/// added in separate lifecycle files. Reassembly must preserve all three
/// fields exactly unless that operation documents a deliberate attempt-state
/// transition.
pub(super) struct LocalLogStorageUncertainAppendAttemptParts {
    pub(super) queue: LocalLogStorageAppendQueue,
    pub(super) attempt_id: LocalLogStorageAppendAttemptId,
    pub(super) request_id: Option<LocalLogStorageAppendRequestId>,
}

impl LocalLogStorageUncertainAppendAttempt {
    pub(super) const fn new(
        queue: LocalLogStorageAppendQueue,
        attempt_id: LocalLogStorageAppendAttemptId,
    ) -> Self {
        Self { queue, attempt_id, request_id: None }
    }

    pub(super) fn from_parts(parts: LocalLogStorageUncertainAppendAttemptParts) -> Self {
        let LocalLogStorageUncertainAppendAttemptParts { queue, attempt_id, request_id } = parts;
        debug_assert!(
            request_id.as_ref().is_none_or(|request_id| request_id.attempt_id() == &attempt_id)
        );
        Self { queue, attempt_id, request_id }
    }

    pub(super) fn into_parts(self) -> LocalLogStorageUncertainAppendAttemptParts {
        LocalLogStorageUncertainAppendAttemptParts {
            queue: self.queue,
            attempt_id: self.attempt_id,
            request_id: self.request_id,
        }
    }

    /// Returns the retained nonempty FIFO without transferring ownership.
    ///
    /// Its public view exposes safe metadata and speculative state only. Raw
    /// head bytes and follower identities remain private.
    pub const fn queue(&self) -> &LocalLogStorageAppendQueue {
        &self.queue
    }

    /// Returns the current physical append-attempt correlation identity.
    #[must_use]
    pub const fn attempt_id(&self) -> &LocalLogStorageAppendAttemptId {
        &self.attempt_id
    }

    /// Returns whether this attempt already yielded its one adapter request.
    #[must_use]
    pub const fn request_issued(&self) -> bool {
        self.request_id.is_some()
    }

    #[cfg(test)]
    pub(super) const fn request_id(&self) -> Option<&LocalLogStorageAppendRequestId> {
        self.request_id.as_ref()
    }

    /// Returns the complete expected comparison binding for head I/O.
    #[must_use]
    pub const fn expected_binding(&self) -> &LocalLogStorageMutationFenceBinding {
        self.queue.expected_binding()
    }

    /// Returns the complete selected-envelope scalar binding to re-observe.
    #[must_use]
    pub const fn selected_binding(&self) -> &LocalLogStorageSelectedBinding {
        self.expected_binding().selected_binding()
    }
}

impl fmt::Debug for LocalLogStorageUncertainAppendAttempt {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("LocalLogStorageUncertainAppendAttempt")
            .field("attempt_id", &self.attempt_id)
            .field("request_issued", &self.request_issued())
            .field("queue", &self.queue)
            .finish_non_exhaustive()
    }
}

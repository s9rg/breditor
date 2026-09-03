use std::fmt;

use crate::local_log::{LocalLogStorageAppendAttemptId, LocalLogStorageAppendRequestId};

use super::{
    LocalLogStorageAppendQueue,
    local_log_storage_issued_append_attempt::LocalLogStorageIssuedAppendAttempt,
};

/// An exact append queue after its correlated physical transaction aborted.
///
/// The abort closes only the associated transaction. It is not proof that
/// copied request data made no storage change in an uncorrelated dispatch. No
/// head is removed, and this state has consumed its terminal event. It accepts
/// only allocation-preserving exact resubmission under a fresh attempt ID.
///
/// ```compile_fail
/// fn require_clone<T: Clone>() {}
/// require_clone::<breditor_core::codec::LocalLogStorageAppendAttemptAborted>();
/// ```
///
/// This attempt cannot observe a second terminal event:
///
/// ```compile_fail
/// fn second(
///     state: breditor_core::codec::LocalLogStorageAppendAttemptAborted,
///     attestation: breditor_core::codec::LocalLogStorageAppendTerminalAttestation,
/// ) {
///     let _ = state.observe_terminal_attestation(attestation);
/// }
/// ```
///
/// Negative evidence cannot acknowledge or remove the head:
///
/// ```compile_fail
/// fn acknowledge(state: breditor_core::codec::LocalLogStorageAppendAttemptAborted) {
///     let _ = state.acknowledge_head();
/// }
/// ```
#[must_use = "an aborted append remains an unresolved allocation-preserving queue"]
pub struct LocalLogStorageAppendAttemptAborted {
    pub(super) retained: LocalLogStorageIssuedAppendAttempt,
}

impl LocalLogStorageAppendAttemptAborted {
    pub(super) const fn new(retained: LocalLogStorageIssuedAppendAttempt) -> Self {
        Self { retained }
    }

    /// Returns the closed physical append-attempt identity.
    #[must_use]
    pub const fn attempt_id(&self) -> &LocalLogStorageAppendAttemptId {
        self.retained.attempt_id()
    }

    /// Returns the emitted request identity whose transaction aborted.
    #[must_use]
    pub const fn request_id(&self) -> &LocalLogStorageAppendRequestId {
        self.retained.request_id()
    }

    /// Returns a safe metadata-only view of the unchanged queue.
    pub const fn queue(&self) -> &LocalLogStorageAppendQueue {
        self.retained.queue()
    }
}

impl fmt::Debug for LocalLogStorageAppendAttemptAborted {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("LocalLogStorageAppendAttemptAborted")
            .field("attempt_id", self.attempt_id())
            .field("request_id", self.request_id())
            .field("queue", self.queue())
            .finish_non_exhaustive()
    }
}

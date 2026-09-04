use std::fmt;

use crate::local_log::LocalLogStorageAppendAttemptId;

use super::{
    LocalLogStorageAppendQueue,
    local_log_storage_retained_append_attempt::LocalLogStorageRetainedAppendAttempt,
};

/// An append invocation attested to have created no transaction.
///
/// This closes one invocation, not the queue or every possible dispatch. If a
/// request was exposed, copied data may still have escaped outside the
/// correlation contract. No head is removed, this state grants no authority,
/// and it can either exact-resubmit or enter same-process observational
/// resolution without discarding its honest pre/post-egress provenance.
///
/// ```compile_fail
/// fn require_clone<T: Clone>() {}
/// require_clone::<breditor_core::codec::LocalLogStorageAppendNotAttempted>();
/// ```
///
/// This invocation cannot observe a second terminal event:
///
/// ```compile_fail
/// fn second(
///     state: breditor_core::codec::LocalLogStorageAppendNotAttempted,
///     attestation: breditor_core::codec::LocalLogStorageAppendTerminalAttestation,
/// ) {
///     let _ = state.observe_terminal_attestation(attestation);
/// }
/// ```
///
/// Negative evidence cannot acknowledge or remove the head:
///
/// ```compile_fail
/// fn acknowledge(state: breditor_core::codec::LocalLogStorageAppendNotAttempted) {
///     let _ = state.acknowledge_head();
/// }
/// ```
#[must_use = "a not-attempted append remains an unresolved allocation-preserving queue"]
pub struct LocalLogStorageAppendNotAttempted {
    pub(super) retained: LocalLogStorageRetainedAppendAttempt,
}

impl LocalLogStorageAppendNotAttempted {
    pub(super) const fn new(retained: LocalLogStorageRetainedAppendAttempt) -> Self {
        Self { retained }
    }

    /// Returns the closed physical append-attempt identity.
    #[must_use]
    pub const fn attempt_id(&self) -> &LocalLogStorageAppendAttemptId {
        self.retained.attempt_id()
    }

    /// Returns whether this invocation exposed its adapter request.
    #[must_use]
    pub const fn request_issued(&self) -> bool {
        self.retained.request_issued()
    }

    /// Returns a safe metadata-only view of the unchanged queue.
    pub const fn queue(&self) -> &LocalLogStorageAppendQueue {
        self.retained.queue()
    }
}

impl fmt::Debug for LocalLogStorageAppendNotAttempted {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("LocalLogStorageAppendNotAttempted")
            .field("attempt_id", self.attempt_id())
            .field("request_issued", &self.request_issued())
            .field("queue", self.queue())
            .finish_non_exhaustive()
    }
}

use std::fmt;

use crate::local_log::{LocalLogStorageAppendAttemptId, LocalLogStorageAppendRequestId};

use super::{
    LocalLogStorageAppendQueue,
    local_log_storage_issued_append_attempt::LocalLogStorageIssuedAppendAttempt,
};

/// Host-attested presence of the exact correlated FIFO head after completion.
///
/// The host asserted that the exact qualifying transaction emitted `complete`
/// after either adding this head or proving it already was the byte-identical
/// valid final record. The core checked process-local correlation and typestate
/// only; it cannot authenticate the transaction or event. This state therefore
/// means profile-level host-attested presence, not native durable flush,
/// permanent availability, current writer authority, or proof against a later
/// reset, eviction, or rollback.
///
/// The complete queue remains owned here. The head has not yet been removed;
/// only the separate infallible acknowledgement action may consume this state
/// and advance exactly one FIFO position. There is no public queue extraction,
/// resubmission, follower selection, or raw-byte accessor.
///
/// ```compile_fail
/// fn require_clone<T: Clone>() {}
/// require_clone::<breditor_core::codec::LocalLogStorageAppendHeadPresent>();
/// ```
///
/// A completed head cannot be exact-resubmitted:
///
/// ```compile_fail
/// fn retry(state: breditor_core::codec::LocalLogStorageAppendHeadPresent) {
///     let _ = state.begin_exact_resubmission();
/// }
/// ```
///
/// The complete owned queue cannot bypass acknowledgement:
///
/// ```compile_fail
/// fn bypass(
///     state: breditor_core::codec::LocalLogStorageAppendHeadPresent,
/// ) -> breditor_core::codec::LocalLogStorageAppendQueue {
///     state.into_queue()
/// }
/// ```
///
/// The consuming acknowledgement cannot be applied twice:
///
/// ```compile_fail
/// fn twice(state: breditor_core::codec::LocalLogStorageAppendHeadPresent) {
///     let _first = state.acknowledge_head();
///     let _second = state.acknowledge_head();
/// }
/// ```
#[must_use = "a host-attested present head still owns the queue until acknowledged"]
pub struct LocalLogStorageAppendHeadPresent {
    retained: LocalLogStorageIssuedAppendAttempt,
}

impl LocalLogStorageAppendHeadPresent {
    pub(super) const fn new(retained: LocalLogStorageIssuedAppendAttempt) -> Self {
        Self { retained }
    }

    /// Returns the completed physical append-attempt identity.
    #[must_use]
    pub const fn attempt_id(&self) -> &LocalLogStorageAppendAttemptId {
        self.retained.attempt_id()
    }

    /// Returns the request identity whose exact transaction completed.
    #[must_use]
    pub const fn request_id(&self) -> &LocalLogStorageAppendRequestId {
        self.retained.request_id()
    }

    /// Returns a safe metadata-only view of the retained nonempty queue.
    ///
    /// The queue exposes no raw head bytes, followers, pop, or cursor release.
    pub const fn queue(&self) -> &LocalLogStorageAppendQueue {
        self.retained.queue()
    }

    pub(super) fn into_issued(self) -> LocalLogStorageIssuedAppendAttempt {
        self.retained
    }
}

impl fmt::Debug for LocalLogStorageAppendHeadPresent {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("LocalLogStorageAppendHeadPresent")
            .field("attempt_id", self.attempt_id())
            .field("request_id", self.request_id())
            .field("queue", self.queue())
            .finish_non_exhaustive()
    }
}

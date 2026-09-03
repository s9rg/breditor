use std::fmt;

use crate::local_log::{
    LocalLogObservationOutcome, LocalLogStorageAppendRequestId, LocalLogStorageChunkStart,
};

use super::{
    LocalLogStorageAppendQueue,
    local_log_storage_append_head_acknowledgement::LocalLogStorageAppendHeadAcknowledgement,
};

/// Remaining nonempty FIFO after exactly one positive head acknowledgement.
///
/// This owner records which request authorized removal and owns the queue with
/// exactly the first retained follower promoted to its new head. Recovering
/// that queue permits a separately correlated attempt for the new head; it
/// does not dispatch or acknowledge that successor and does not prove the
/// retained mutation token remains current.
///
/// ```compile_fail
/// fn require_clone<T: Clone>() {}
/// require_clone::<breditor_core::codec::LocalLogStorageAppendHeadAcknowledged>();
/// ```
///
/// No acknowledged or pending frame bytes are exposed by this owner:
///
/// ```compile_fail
/// fn expose(owner: &breditor_core::codec::LocalLogStorageAppendHeadAcknowledged) -> &[u8] {
///     owner.head_frame()
/// }
/// ```
///
/// A promoted follower needs its own attempt and cannot be acknowledged here:
///
/// ```compile_fail
/// fn skip(owner: breditor_core::codec::LocalLogStorageAppendHeadAcknowledged) {
///     let _ = owner.acknowledge_head();
/// }
/// ```
#[must_use = "an acknowledged append head still owns a nonempty pending queue"]
pub struct LocalLogStorageAppendHeadAcknowledged {
    queue: LocalLogStorageAppendQueue,
    acknowledgement: LocalLogStorageAppendHeadAcknowledgement,
}

impl LocalLogStorageAppendHeadAcknowledged {
    pub(super) const fn new(
        queue: LocalLogStorageAppendQueue,
        acknowledgement: LocalLogStorageAppendHeadAcknowledgement,
    ) -> Self {
        Self { queue, acknowledgement }
    }

    /// Returns the exact request whose terminal completion authorized removal.
    ///
    /// The process-local identity is diagnostic provenance, not storage
    /// authority or evidence that the promoted head has been attempted.
    #[must_use]
    pub const fn acknowledged_request_id(&self) -> &LocalLogStorageAppendRequestId {
        self.acknowledgement.request_id()
    }

    /// Returns the generation-relative start of the removed head frame.
    #[must_use]
    pub const fn acknowledged_head_chunk_start(&self) -> LocalLogStorageChunkStart {
        self.acknowledgement.chunk_start()
    }

    /// Returns the exclusive generation-relative end of the removed head frame.
    #[must_use]
    pub const fn acknowledged_head_frame_end(&self) -> u64 {
        self.acknowledgement.frame_end()
    }

    /// Returns the exact encoded byte length of the removed head frame.
    #[must_use]
    pub const fn acknowledged_head_frame_bytes(&self) -> usize {
        self.acknowledgement.frame_bytes()
    }

    /// Returns the removed head's speculative semantic admission result.
    #[must_use]
    pub const fn acknowledged_head_observation_outcome(&self) -> LocalLogObservationOutcome {
        self.acknowledgement.observation()
    }

    /// Returns the complete remaining nonempty FIFO without transferring it.
    pub const fn queue(&self) -> &LocalLogStorageAppendQueue {
        &self.queue
    }

    /// Recovers the complete remaining nonempty FIFO.
    ///
    /// The new head requires its own attempt, request, and terminal evidence.
    /// The retained mutation token is revocable and must be revalidated by
    /// every subsequent protected storage transaction.
    #[must_use = "the returned queue retains revocable authority and speculative state"]
    pub fn into_queue(self) -> LocalLogStorageAppendQueue {
        self.queue
    }
}

impl fmt::Debug for LocalLogStorageAppendHeadAcknowledged {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("LocalLogStorageAppendHeadAcknowledged")
            .field("acknowledgement", &self.acknowledgement)
            .field("queue", &self.queue)
            .finish_non_exhaustive()
    }
}

use std::fmt;

use crate::local_log::{
    LocalLogObservationOutcome, LocalLogStorageAppendRequestId, LocalLogStorageChunkStart,
};

use super::{
    LocalLogStorageAppendQueueLimits, LocalLogStorageMutationToken, LocalLogTailCursor,
    local_log_storage_append_head_acknowledgement::LocalLogStorageAppendHeadAcknowledgement,
};

/// Token and final speculative cursor after a FIFO becomes empty.
///
/// This state exists only after exactly one positive acknowledgement removed
/// the queue's sole remaining head. The cursor therefore ends immediately
/// after that acknowledged frame and no logical follower remains retained.
/// Queue limits are preserved so a caller can deliberately carry the same
/// resource policy into a later operation.
///
/// The terminal append callback is historical evidence. It does not prove
/// that the token or cursor is still current when this owner is observed:
/// another writer-fence acquisition, rotation, reset, or append can already
/// have changed storage. Consuming this owner releases Rust ownership only.
/// It grants no long-lived lock, currentness, durability, rotation authority,
/// or permission to reconstruct a queue without the next operation's required
/// checks.
///
/// ```compile_fail
/// fn require_clone<T: Clone>() {}
/// require_clone::<breditor_core::codec::LocalLogStorageAppendQueueDrained>();
/// ```
///
/// A drained owner has no pending head to attempt:
///
/// ```compile_fail
/// fn attempt(owner: breditor_core::codec::LocalLogStorageAppendQueueDrained) {
///     let _ = owner.begin_head_append_attempt();
/// }
/// ```
#[must_use = "a drained append queue still owns revocable authority and its final cursor"]
pub struct LocalLogStorageAppendQueueDrained {
    token: LocalLogStorageMutationToken,
    final_cursor: LocalLogTailCursor,
    limits: LocalLogStorageAppendQueueLimits,
    acknowledgement: LocalLogStorageAppendHeadAcknowledgement,
}

impl LocalLogStorageAppendQueueDrained {
    pub(super) const fn new(
        token: LocalLogStorageMutationToken,
        final_cursor: LocalLogTailCursor,
        limits: LocalLogStorageAppendQueueLimits,
        acknowledgement: LocalLogStorageAppendHeadAcknowledgement,
    ) -> Self {
        Self { token, final_cursor, limits, acknowledgement }
    }

    /// Returns the request whose terminal completion drained this queue.
    ///
    /// This process-local identity is diagnostic provenance only.
    #[must_use]
    pub const fn acknowledged_request_id(&self) -> &LocalLogStorageAppendRequestId {
        self.acknowledgement.request_id()
    }

    /// Returns the generation-relative start of the removed final head frame.
    #[must_use]
    pub const fn acknowledged_head_chunk_start(&self) -> LocalLogStorageChunkStart {
        self.acknowledgement.chunk_start()
    }

    /// Returns the exclusive generation-relative end of the removed final head frame.
    #[must_use]
    pub const fn acknowledged_head_frame_end(&self) -> u64 {
        self.acknowledgement.frame_end()
    }

    /// Returns the exact encoded byte length of the removed final head frame.
    #[must_use]
    pub const fn acknowledged_head_frame_bytes(&self) -> usize {
        self.acknowledgement.frame_bytes()
    }

    /// Returns the removed final head's speculative semantic admission result.
    #[must_use]
    pub const fn acknowledged_head_observation_outcome(&self) -> LocalLogObservationOutcome {
        self.acknowledgement.observation()
    }

    /// Returns the retained revocable storage-mutation token.
    ///
    /// Historical head acknowledgement does not prove this token is current.
    pub const fn token(&self) -> &LocalLogStorageMutationToken {
        &self.token
    }

    /// Returns the final speculative cursor immediately after the acknowledged head.
    ///
    /// Its offset and semantic state describe the acknowledged queue branch;
    /// they are not a fresh observation of the physical storage tail.
    #[must_use]
    pub const fn final_cursor(&self) -> &LocalLogTailCursor {
        &self.final_cursor
    }

    /// Returns the immutable resource policy retained from the drained queue.
    #[must_use]
    pub const fn limits(&self) -> LocalLogStorageAppendQueueLimits {
        self.limits
    }

    /// Releases the retained token, final cursor, and queue limits.
    ///
    /// The returned token may already be stale and the cursor is not an
    /// independently observed physical tail. A future protected storage
    /// operation must perform its full binding and tail validation before
    /// relying on either value. The acknowledged request ID is diagnostic and
    /// is intentionally discarded by this ownership-release boundary.
    #[must_use = "the returned token and cursor retain revocable authority and semantic state"]
    pub fn into_parts(
        self,
    ) -> (LocalLogStorageMutationToken, LocalLogTailCursor, LocalLogStorageAppendQueueLimits) {
        (self.token, self.final_cursor, self.limits)
    }
}

impl fmt::Debug for LocalLogStorageAppendQueueDrained {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("LocalLogStorageAppendQueueDrained")
            .field("acknowledgement", &self.acknowledgement)
            .field("token", &self.token)
            .field("final_cursor", &self.final_cursor)
            .field("limits", &self.limits)
            .finish_non_exhaustive()
    }
}

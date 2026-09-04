use std::fmt;

use crate::local_log::{
    LocalLogObservationOutcome, LocalLogStorageAppendAttemptId, LocalLogStorageAppendRequestId,
    LocalLogStorageAppendResolutionRequestId, LocalLogStorageChunkStart,
};

use super::{
    LocalLogStorageAppendQueue, LocalLogStorageAppendResolutionSourceKind,
    local_log_storage_append_resolution_head_acknowledgement::LocalLogStorageAppendResolutionHeadAcknowledgement,
};

/// Remaining FIFO after exactly one resolution-positive head acknowledgement.
///
/// The first retained follower has been promoted unchanged. This state starts
/// no request or attempt, grants no writer authority, and exposes no frame
/// bytes. The optional source append request remains absent when resolution
/// began from a pre-egress `NotAttempted` invocation.
#[must_use = "a resolution-acknowledged head still owns a nonempty pending queue"]
pub struct LocalLogStorageAppendHeadAcknowledgedAtResolution {
    queue: LocalLogStorageAppendQueue,
    acknowledgement: LocalLogStorageAppendResolutionHeadAcknowledgement,
}

impl LocalLogStorageAppendHeadAcknowledgedAtResolution {
    pub(super) const fn new(
        queue: LocalLogStorageAppendQueue,
        acknowledgement: LocalLogStorageAppendResolutionHeadAcknowledgement,
    ) -> Self {
        Self { queue, acknowledgement }
    }

    /// Returns the completed resolver request that authorized removal.
    #[must_use]
    pub const fn resolution_request_id(&self) -> &LocalLogStorageAppendResolutionRequestId {
        self.acknowledgement.resolution_request_id()
    }

    /// Returns the exact source-state provenance.
    #[must_use]
    pub const fn source_kind(&self) -> LocalLogStorageAppendResolutionSourceKind {
        self.acknowledgement.source_kind()
    }

    /// Returns the original append-attempt identity.
    #[must_use]
    pub const fn source_attempt_id(&self) -> &LocalLogStorageAppendAttemptId {
        self.acknowledgement.source_attempt_id()
    }

    /// Returns the original append request when one existed.
    #[must_use]
    pub const fn source_append_request_id(&self) -> Option<&LocalLogStorageAppendRequestId> {
        self.acknowledgement.source_append_request_id()
    }

    /// Returns the generation-relative start of the removed head.
    #[must_use]
    pub const fn acknowledged_head_chunk_start(&self) -> LocalLogStorageChunkStart {
        self.acknowledgement.chunk_start()
    }

    /// Returns the exclusive generation-relative end of the removed head.
    #[must_use]
    pub const fn acknowledged_head_frame_end(&self) -> u64 {
        self.acknowledgement.frame_end()
    }

    /// Returns the encoded byte length of the removed head.
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

    /// Recovers the remaining FIFO; its promoted head needs a fresh attempt.
    #[must_use = "the returned queue retains revocable authority and speculative state"]
    pub fn into_queue(self) -> LocalLogStorageAppendQueue {
        self.queue
    }
}

impl fmt::Debug for LocalLogStorageAppendHeadAcknowledgedAtResolution {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("LocalLogStorageAppendHeadAcknowledgedAtResolution")
            .field("acknowledgement", &self.acknowledgement)
            .field("queue", &self.queue)
            .finish_non_exhaustive()
    }
}

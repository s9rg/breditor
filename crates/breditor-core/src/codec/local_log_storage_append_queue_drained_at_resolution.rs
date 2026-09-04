use std::fmt;

use crate::local_log::{
    LocalLogObservationOutcome, LocalLogStorageAppendAttemptId, LocalLogStorageAppendRequestId,
    LocalLogStorageAppendResolutionRequestId, LocalLogStorageChunkStart,
};

use super::{
    LocalLogStorageAppendQueueLimits, LocalLogStorageAppendResolutionSourceKind,
    LocalLogStorageMutationToken, LocalLogTailCursor,
    local_log_storage_append_resolution_head_acknowledgement::LocalLogStorageAppendResolutionHeadAcknowledgement,
};

/// Token and final speculative cursor after resolution drains a FIFO.
///
/// The resolver observation and acknowledgement are historical. They do not
/// prove this token/cursor remains current, provide a native flush receipt, or
/// protect against reset, eviction, rollback, rotation, or later writes.
#[must_use = "a resolution-drained queue still owns revocable authority and its final cursor"]
pub struct LocalLogStorageAppendQueueDrainedAtResolution {
    token: LocalLogStorageMutationToken,
    final_cursor: LocalLogTailCursor,
    limits: LocalLogStorageAppendQueueLimits,
    acknowledgement: LocalLogStorageAppendResolutionHeadAcknowledgement,
}

impl LocalLogStorageAppendQueueDrainedAtResolution {
    pub(super) const fn new(
        token: LocalLogStorageMutationToken,
        final_cursor: LocalLogTailCursor,
        limits: LocalLogStorageAppendQueueLimits,
        acknowledgement: LocalLogStorageAppendResolutionHeadAcknowledgement,
    ) -> Self {
        Self { token, final_cursor, limits, acknowledgement }
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

    /// Returns the generation-relative start of the removed final head.
    #[must_use]
    pub const fn acknowledged_head_chunk_start(&self) -> LocalLogStorageChunkStart {
        self.acknowledgement.chunk_start()
    }

    /// Returns the exclusive generation-relative end of the removed final head.
    #[must_use]
    pub const fn acknowledged_head_frame_end(&self) -> u64 {
        self.acknowledgement.frame_end()
    }

    /// Returns the encoded byte length of the removed final head.
    #[must_use]
    pub const fn acknowledged_head_frame_bytes(&self) -> usize {
        self.acknowledgement.frame_bytes()
    }

    /// Returns the removed final head's speculative semantic result.
    #[must_use]
    pub const fn acknowledged_head_observation_outcome(&self) -> LocalLogObservationOutcome {
        self.acknowledgement.observation()
    }

    /// Returns the retained revocable storage-mutation token.
    pub const fn token(&self) -> &LocalLogStorageMutationToken {
        &self.token
    }

    /// Returns the speculative cursor immediately after the removed final head.
    #[must_use]
    pub const fn final_cursor(&self) -> &LocalLogTailCursor {
        &self.final_cursor
    }

    /// Returns the immutable queue resource policy.
    #[must_use]
    pub const fn limits(&self) -> LocalLogStorageAppendQueueLimits {
        self.limits
    }

    /// Releases the retained token, cursor, and queue limits.
    #[must_use = "the returned token and cursor retain revocable speculative state"]
    pub fn into_parts(
        self,
    ) -> (LocalLogStorageMutationToken, LocalLogTailCursor, LocalLogStorageAppendQueueLimits) {
        (self.token, self.final_cursor, self.limits)
    }
}

impl fmt::Debug for LocalLogStorageAppendQueueDrainedAtResolution {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("LocalLogStorageAppendQueueDrainedAtResolution")
            .field("acknowledgement", &self.acknowledgement)
            .field("token", &self.token)
            .field("final_cursor", &self.final_cursor)
            .field("limits", &self.limits)
            .finish_non_exhaustive()
    }
}

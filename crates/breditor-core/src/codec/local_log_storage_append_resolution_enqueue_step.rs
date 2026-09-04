use std::fmt;

use crate::local_log::{LocalLogObservationOutcome, LocalLogStorageChunkStart};

use super::LocalLogStorageAppendResolution;

/// Successful logical enqueue behind one head undergoing append resolution.
///
/// The step owns the complete resolver and reports only bounded metadata for
/// the newly admitted follower. Source and resolver correlation, the immutable
/// head, queue order, token, limits, and earlier allocations remain intact.
/// This value exposes no follower bytes and grants no dispatch permission.
#[must_use = "an append-resolution enqueue step owns the complete resolver"]
pub struct LocalLogStorageAppendResolutionEnqueueStep {
    owner: LocalLogStorageAppendResolution,
    chunk_start: LocalLogStorageChunkStart,
    frame_end: u64,
    frame_bytes: usize,
    observation: LocalLogObservationOutcome,
}

impl LocalLogStorageAppendResolutionEnqueueStep {
    pub(super) const fn new(
        owner: LocalLogStorageAppendResolution,
        chunk_start: LocalLogStorageChunkStart,
        frame_end: u64,
        frame_bytes: usize,
        observation: LocalLogObservationOutcome,
    ) -> Self {
        Self { owner, chunk_start, frame_end, frame_bytes, observation }
    }

    /// Returns the complete append-resolution owner.
    pub const fn owner(&self) -> &LocalLogStorageAppendResolution {
        &self.owner
    }

    /// Returns the newly admitted follower's generation-relative start.
    #[must_use]
    pub const fn chunk_start(&self) -> LocalLogStorageChunkStart {
        self.chunk_start
    }

    /// Returns the follower's exclusive generation-relative byte end.
    #[must_use]
    pub const fn frame_end(&self) -> u64 {
        self.frame_end
    }

    /// Returns the follower's exact encoded byte length.
    #[must_use]
    pub const fn frame_bytes(&self) -> usize {
        self.frame_bytes
    }

    /// Returns the logical enqueue's semantic admission result.
    #[must_use]
    pub const fn observation_outcome(&self) -> LocalLogObservationOutcome {
        self.observation
    }

    /// Recovers the complete append-resolution owner.
    #[must_use = "the returned resolver retains the unresolved head and queue"]
    pub fn into_owner(self) -> LocalLogStorageAppendResolution {
        self.owner
    }

    /// Separates the resolver from this enqueue's bounded metadata.
    #[must_use = "the returned resolver retains the unresolved head and queue"]
    pub fn into_parts(
        self,
    ) -> (
        LocalLogStorageAppendResolution,
        LocalLogStorageChunkStart,
        u64,
        usize,
        LocalLogObservationOutcome,
    ) {
        (self.owner, self.chunk_start, self.frame_end, self.frame_bytes, self.observation)
    }
}

impl fmt::Debug for LocalLogStorageAppendResolutionEnqueueStep {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("LocalLogStorageAppendResolutionEnqueueStep")
            .field("source_kind", &self.owner.source_kind())
            .field("source_attempt_id", self.owner.source_attempt_id())
            .field("source_append_request_id", &self.owner.source_append_request_id())
            .field("resolution_request_issued", &self.owner.request_issued())
            .field("chunk_start", &self.chunk_start)
            .field("frame_end", &self.frame_end)
            .field("frame_bytes", &self.frame_bytes)
            .field("observation", &self.observation)
            .field("pending_frames", &self.owner.queue().pending_frames())
            .field("pending_bytes", &self.owner.queue().pending_bytes())
            .finish_non_exhaustive()
    }
}

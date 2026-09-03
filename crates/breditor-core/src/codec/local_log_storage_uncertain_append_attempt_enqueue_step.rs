use std::fmt;

use crate::local_log::{LocalLogObservationOutcome, LocalLogStorageChunkStart};

use super::LocalLogStorageUncertainAppendAttempt;

/// Successful logical enqueue behind one uncertain physical head attempt.
///
/// The step owns the complete uncertain attempt and reports only the newly
/// admitted follower's bounded metadata. The existing attempt/request
/// correlation and immutable head remain unchanged; this value exposes no
/// follower bytes and grants no physical-dispatch permission.
#[must_use = "an uncertain enqueue step owns the complete append attempt"]
pub struct LocalLogStorageUncertainAppendEnqueueStep {
    owner: LocalLogStorageUncertainAppendAttempt,
    chunk_start: LocalLogStorageChunkStart,
    frame_end: u64,
    frame_bytes: usize,
    observation: LocalLogObservationOutcome,
}

impl LocalLogStorageUncertainAppendEnqueueStep {
    pub(super) const fn new(
        owner: LocalLogStorageUncertainAppendAttempt,
        chunk_start: LocalLogStorageChunkStart,
        frame_end: u64,
        frame_bytes: usize,
        observation: LocalLogObservationOutcome,
    ) -> Self {
        Self { owner, chunk_start, frame_end, frame_bytes, observation }
    }

    /// Returns the complete uncertain head-attempt owner.
    pub const fn owner(&self) -> &LocalLogStorageUncertainAppendAttempt {
        &self.owner
    }

    /// Returns the newly admitted follower's generation-relative start.
    #[must_use]
    pub const fn chunk_start(&self) -> LocalLogStorageChunkStart {
        self.chunk_start
    }

    /// Returns the newly admitted follower's exclusive byte end.
    #[must_use]
    pub const fn frame_end(&self) -> u64 {
        self.frame_end
    }

    /// Returns the newly admitted follower's exact encoded byte length.
    #[must_use]
    pub const fn frame_bytes(&self) -> usize {
        self.frame_bytes
    }

    /// Returns this logical enqueue's semantic admission result.
    #[must_use]
    pub const fn observation_outcome(&self) -> LocalLogObservationOutcome {
        self.observation
    }

    /// Recovers the complete uncertain head-attempt owner.
    #[must_use = "the returned attempt retains queue authority and uncertainty"]
    pub fn into_owner(self) -> LocalLogStorageUncertainAppendAttempt {
        self.owner
    }

    /// Separates the owner from this enqueue's bounded metadata.
    #[must_use = "the returned attempt retains queue authority and uncertainty"]
    pub fn into_parts(
        self,
    ) -> (
        LocalLogStorageUncertainAppendAttempt,
        LocalLogStorageChunkStart,
        u64,
        usize,
        LocalLogObservationOutcome,
    ) {
        (self.owner, self.chunk_start, self.frame_end, self.frame_bytes, self.observation)
    }
}

impl fmt::Debug for LocalLogStorageUncertainAppendEnqueueStep {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("LocalLogStorageUncertainAppendEnqueueStep")
            .field("attempt_id", self.owner.attempt_id())
            .field("request_issued", &self.owner.request_issued())
            .field("chunk_start", &self.chunk_start)
            .field("frame_end", &self.frame_end)
            .field("frame_bytes", &self.frame_bytes)
            .field("observation", &self.observation)
            .field("pending_frames", &self.owner.queue().pending_frames())
            .field("pending_bytes", &self.owner.queue().pending_bytes())
            .finish_non_exhaustive()
    }
}

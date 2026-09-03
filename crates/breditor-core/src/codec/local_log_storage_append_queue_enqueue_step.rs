use std::fmt;

use crate::local_log::{LocalLogObservationOutcome, LocalLogStorageChunkStart};

use super::LocalLogStorageAppendQueue;

/// Successful admission of exactly one frame at an append queue's back.
///
/// The step owns the complete updated queue and copies only the newly admitted
/// frame's bounded metadata. This reports the causal result of one enqueue,
/// including exact-duplicate admission, without exposing follower bytes or
/// making that follower eligible for physical dispatch.
#[must_use = "a successful enqueue step owns the complete updated append queue"]
pub struct LocalLogStorageAppendQueueEnqueueStep {
    queue: LocalLogStorageAppendQueue,
    chunk_start: LocalLogStorageChunkStart,
    frame_end: u64,
    frame_bytes: usize,
    observation: LocalLogObservationOutcome,
}

impl LocalLogStorageAppendQueueEnqueueStep {
    pub(super) const fn new(
        queue: LocalLogStorageAppendQueue,
        chunk_start: LocalLogStorageChunkStart,
        frame_end: u64,
        frame_bytes: usize,
        observation: LocalLogObservationOutcome,
    ) -> Self {
        Self { queue, chunk_start, frame_end, frame_bytes, observation }
    }

    /// Returns the complete updated append queue.
    pub const fn queue(&self) -> &LocalLogStorageAppendQueue {
        &self.queue
    }

    /// Returns the newly admitted frame's generation-relative start.
    #[must_use]
    pub const fn chunk_start(&self) -> LocalLogStorageChunkStart {
        self.chunk_start
    }

    /// Returns the newly admitted frame's exclusive generation-relative end.
    #[must_use]
    pub const fn frame_end(&self) -> u64 {
        self.frame_end
    }

    /// Returns the newly admitted frame's exact encoded byte length.
    #[must_use]
    pub const fn frame_bytes(&self) -> usize {
        self.frame_bytes
    }

    /// Returns this enqueue's semantic admission result.
    #[must_use]
    pub const fn observation_outcome(&self) -> LocalLogObservationOutcome {
        self.observation
    }

    /// Recovers the complete updated append queue.
    #[must_use = "the returned queue retains revocable authority and speculative state"]
    pub fn into_queue(self) -> LocalLogStorageAppendQueue {
        self.queue
    }

    /// Separates the updated queue from this enqueue's bounded metadata.
    #[must_use = "the returned queue retains revocable authority and speculative state"]
    pub fn into_parts(
        self,
    ) -> (
        LocalLogStorageAppendQueue,
        LocalLogStorageChunkStart,
        u64,
        usize,
        LocalLogObservationOutcome,
    ) {
        (self.queue, self.chunk_start, self.frame_end, self.frame_bytes, self.observation)
    }
}

impl fmt::Debug for LocalLogStorageAppendQueueEnqueueStep {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("LocalLogStorageAppendQueueEnqueueStep")
            .field("chunk_start", &self.chunk_start)
            .field("frame_end", &self.frame_end)
            .field("frame_bytes", &self.frame_bytes)
            .field("observation", &self.observation)
            .field("pending_frames", &self.queue.pending_frames())
            .field("pending_bytes", &self.queue.pending_bytes())
            .finish_non_exhaustive()
    }
}

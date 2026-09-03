use std::fmt;

use crate::local_log::{
    LocalLogObservationOutcome, LocalLogStorageAppendRequestId, LocalLogStorageChunkStart,
};

/// Core-private bounded record of the exact FIFO head that was acknowledged.
///
/// The record deliberately retains no frame bytes. Both public ownership
/// outcomes embed it so a caller can inspect the singular transition without
/// reopening access to the removed payload.
pub(super) struct LocalLogStorageAppendHeadAcknowledgement {
    request_id: LocalLogStorageAppendRequestId,
    chunk_start: LocalLogStorageChunkStart,
    frame_end: u64,
    frame_bytes: usize,
    observation: LocalLogObservationOutcome,
}

impl LocalLogStorageAppendHeadAcknowledgement {
    pub(super) const fn new(
        request_id: LocalLogStorageAppendRequestId,
        chunk_start: LocalLogStorageChunkStart,
        frame_end: u64,
        frame_bytes: usize,
        observation: LocalLogObservationOutcome,
    ) -> Self {
        Self { request_id, chunk_start, frame_end, frame_bytes, observation }
    }

    pub(super) const fn request_id(&self) -> &LocalLogStorageAppendRequestId {
        &self.request_id
    }

    pub(super) const fn chunk_start(&self) -> LocalLogStorageChunkStart {
        self.chunk_start
    }

    pub(super) const fn frame_end(&self) -> u64 {
        self.frame_end
    }

    pub(super) const fn frame_bytes(&self) -> usize {
        self.frame_bytes
    }

    pub(super) const fn observation(&self) -> LocalLogObservationOutcome {
        self.observation
    }
}

impl fmt::Debug for LocalLogStorageAppendHeadAcknowledgement {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("LocalLogStorageAppendHeadAcknowledgement")
            .field("request_id", &self.request_id)
            .field("chunk_start", &self.chunk_start)
            .field("frame_end", &self.frame_end)
            .field("frame_bytes", &self.frame_bytes)
            .field("observation", &self.observation)
            .finish_non_exhaustive()
    }
}

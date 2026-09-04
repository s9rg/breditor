use std::fmt;

use crate::local_log::{
    LocalLogObservationOutcome, LocalLogStorageAppendAttemptId, LocalLogStorageAppendRequestId,
    LocalLogStorageAppendResolutionRequestId, LocalLogStorageChunkStart,
};

use super::LocalLogStorageAppendResolutionSourceKind;

/// Core-private bounded record of a resolution-acknowledged FIFO head.
///
/// This retains truthful tagged provenance, including an optional original
/// append request. It deliberately retains neither expected nor observed frame
/// bytes and cannot be mistaken for a native durability receipt.
pub(super) struct LocalLogStorageAppendResolutionHeadAcknowledgement {
    resolution_request_id: LocalLogStorageAppendResolutionRequestId,
    source_kind: LocalLogStorageAppendResolutionSourceKind,
    source_attempt_id: LocalLogStorageAppendAttemptId,
    source_append_request_id: Option<LocalLogStorageAppendRequestId>,
    chunk_start: LocalLogStorageChunkStart,
    frame_end: u64,
    frame_bytes: usize,
    observation: LocalLogObservationOutcome,
}

impl LocalLogStorageAppendResolutionHeadAcknowledgement {
    #[allow(clippy::too_many_arguments)]
    pub(super) const fn new(
        resolution_request_id: LocalLogStorageAppendResolutionRequestId,
        source_kind: LocalLogStorageAppendResolutionSourceKind,
        source_attempt_id: LocalLogStorageAppendAttemptId,
        source_append_request_id: Option<LocalLogStorageAppendRequestId>,
        chunk_start: LocalLogStorageChunkStart,
        frame_end: u64,
        frame_bytes: usize,
        observation: LocalLogObservationOutcome,
    ) -> Self {
        Self {
            resolution_request_id,
            source_kind,
            source_attempt_id,
            source_append_request_id,
            chunk_start,
            frame_end,
            frame_bytes,
            observation,
        }
    }

    pub(super) const fn resolution_request_id(&self) -> &LocalLogStorageAppendResolutionRequestId {
        &self.resolution_request_id
    }

    pub(super) const fn source_kind(&self) -> LocalLogStorageAppendResolutionSourceKind {
        self.source_kind
    }

    pub(super) const fn source_attempt_id(&self) -> &LocalLogStorageAppendAttemptId {
        &self.source_attempt_id
    }

    pub(super) const fn source_append_request_id(&self) -> Option<&LocalLogStorageAppendRequestId> {
        self.source_append_request_id.as_ref()
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

impl fmt::Debug for LocalLogStorageAppendResolutionHeadAcknowledgement {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("LocalLogStorageAppendResolutionHeadAcknowledgement")
            .field("resolution_request_id", &self.resolution_request_id)
            .field("source_kind", &self.source_kind)
            .field("source_attempt_id", &self.source_attempt_id)
            .field("source_append_request_id", &self.source_append_request_id)
            .field("chunk_start", &self.chunk_start)
            .field("frame_end", &self.frame_end)
            .field("frame_bytes", &self.frame_bytes)
            .field("observation", &self.observation)
            .finish_non_exhaustive()
    }
}

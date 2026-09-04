use std::fmt;

use crate::local_log::{
    LocalLogStorageAppendAttemptId, LocalLogStorageAppendRequestId,
    LocalLogStorageAppendResolutionRequestId,
};

use super::{
    LocalLogStorageAppendQueue, LocalLogStorageAppendResolutionObservation,
    LocalLogStorageAppendResolutionSourceKind,
    local_log_storage_append_resolution_source::LocalLogStorageAppendResolutionSource,
};

/// Exact FIFO head found as a byte-identical final record during resolution.
///
/// This is deliberately distinct from
/// [`LocalLogStorageAppendHeadPresent`](super::LocalLogStorageAppendHeadPresent):
/// a resolution may begin from a pre-egress `NotAttempted` source that has no
/// append request ID. The state therefore retains truthful tagged provenance
/// and never invents an append request correlation.
///
/// The queue remains intact. Only the separate consuming resolution
/// acknowledgement may remove its structural head. Presence was host-attested
/// at one completed read transaction; it is not a native flush receipt,
/// permanent durability, current writer authority, or proof against reset,
/// eviction, rollback, or later append.
#[must_use = "a resolved present append head still owns its queue until acknowledged"]
pub struct LocalLogStorageAppendHeadPresentAtResolution {
    pub(super) source: LocalLogStorageAppendResolutionSource,
    pub(super) resolution_request_id: LocalLogStorageAppendResolutionRequestId,
    pub(super) observation: LocalLogStorageAppendResolutionObservation,
}

impl LocalLogStorageAppendHeadPresentAtResolution {
    pub(super) const fn new(
        source: LocalLogStorageAppendResolutionSource,
        resolution_request_id: LocalLogStorageAppendResolutionRequestId,
        observation: LocalLogStorageAppendResolutionObservation,
    ) -> Self {
        Self { source, resolution_request_id, observation }
    }

    /// Returns the exact attempt-state provenance that entered resolution.
    #[must_use]
    pub const fn source_kind(&self) -> LocalLogStorageAppendResolutionSourceKind {
        self.source.kind()
    }

    /// Returns the original append-attempt correlation identity.
    #[must_use]
    pub const fn source_attempt_id(&self) -> &LocalLogStorageAppendAttemptId {
        self.source.attempt_id()
    }

    /// Returns the original append request when that source emitted one.
    ///
    /// `None` is retained truthfully for a pre-egress `NotAttempted` source.
    #[must_use]
    pub const fn source_append_request_id(&self) -> Option<&LocalLogStorageAppendRequestId> {
        self.source.append_request_id()
    }

    /// Returns the completed resolver invocation's correlation identity.
    #[must_use]
    pub const fn resolution_request_id(&self) -> &LocalLogStorageAppendResolutionRequestId {
        &self.resolution_request_id
    }

    pub(super) const fn queue(&self) -> &LocalLogStorageAppendQueue {
        self.source.queue()
    }

    pub(super) fn into_parts(
        self,
    ) -> (LocalLogStorageAppendResolutionSource, LocalLogStorageAppendResolutionRequestId) {
        (self.source, self.resolution_request_id)
    }
}

impl fmt::Debug for LocalLogStorageAppendHeadPresentAtResolution {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("LocalLogStorageAppendHeadPresentAtResolution")
            .field("source_kind", &self.source_kind())
            .field("source_attempt_id", self.source_attempt_id())
            .field("source_append_request_id", &self.source_append_request_id())
            .field("resolution_request_id", &self.resolution_request_id)
            .field("observation_kind", &self.observation.kind())
            .field("queue", self.queue())
            .finish_non_exhaustive()
    }
}

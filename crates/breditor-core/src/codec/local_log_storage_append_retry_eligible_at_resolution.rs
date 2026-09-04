use std::fmt;

use crate::local_log::{
    LocalLogStorageAppendAttemptId, LocalLogStorageAppendRequestId,
    LocalLogStorageAppendResolutionRequestId,
};

use super::{
    LocalLogStorageAppendQueue, LocalLogStorageAppendResolutionSourceKind,
    local_log_storage_append_resolution_source::LocalLogStorageAppendResolutionSource,
};

/// Advisory exact-resubmission state after completed clean head absence.
///
/// The resolver observed the target key absent at the exact expected complete
/// prefix tail while the full selected envelope and writer pair remained exact.
/// The result is still advisory outside that transaction: a copied old request
/// may publish later, and the revocable token can become stale immediately.
/// Resubmission therefore preserves every allocation and uses the same strict
/// idempotent exact-head protocol under a fresh append-attempt identity.
#[must_use = "append retry eligibility must be retained, resubmitted, or discarded"]
pub struct LocalLogStorageAppendRetryEligibleAtResolution {
    pub(super) source: LocalLogStorageAppendResolutionSource,
    pub(super) resolution_request_id: LocalLogStorageAppendResolutionRequestId,
}

impl LocalLogStorageAppendRetryEligibleAtResolution {
    pub(super) const fn new(
        source: LocalLogStorageAppendResolutionSource,
        resolution_request_id: LocalLogStorageAppendResolutionRequestId,
    ) -> Self {
        Self { source, resolution_request_id }
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
    #[must_use]
    pub const fn source_append_request_id(&self) -> Option<&LocalLogStorageAppendRequestId> {
        self.source.append_request_id()
    }

    /// Returns the completed resolver invocation identity.
    #[must_use]
    pub const fn resolution_request_id(&self) -> &LocalLogStorageAppendResolutionRequestId {
        &self.resolution_request_id
    }

    pub(super) const fn queue(&self) -> &LocalLogStorageAppendQueue {
        self.source.queue()
    }
}

impl fmt::Debug for LocalLogStorageAppendRetryEligibleAtResolution {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("LocalLogStorageAppendRetryEligibleAtResolution")
            .field("source_kind", &self.source_kind())
            .field("source_attempt_id", self.source_attempt_id())
            .field("source_append_request_id", &self.source_append_request_id())
            .field("resolution_request_id", &self.resolution_request_id)
            .field("queue", self.queue())
            .finish_non_exhaustive()
    }
}

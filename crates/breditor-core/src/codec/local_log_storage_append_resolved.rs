use std::fmt;

use crate::local_log::{
    LocalLogStorageAppendAttemptId, LocalLogStorageAppendRequestId,
    LocalLogStorageAppendResolutionRequestId,
};

use super::{
    LocalLogStorageAppendQueue, LocalLogStorageAppendResolutionCollisionReason,
    LocalLogStorageAppendResolutionObservation, LocalLogStorageAppendResolutionObservationKind,
    LocalLogStorageAppendResolutionSourceKind,
    local_log_storage_append_resolution_source::LocalLogStorageAppendResolutionSource,
};

/// Terminal non-retry, non-acknowledge append-resolution payload.
///
/// This opaque owner retains the exact original queue/source, completed
/// physical finding, and optional bounded collision reason. It exposes no raw
/// head or observed bytes, queue extraction, retry transition, acknowledgement,
/// cursor release, or writer authority.
#[must_use = "a resolved append classification must be explicitly retained or inspected"]
pub struct LocalLogStorageAppendResolved {
    pub(super) source: LocalLogStorageAppendResolutionSource,
    pub(super) resolution_request_id: LocalLogStorageAppendResolutionRequestId,
    pub(super) observation: LocalLogStorageAppendResolutionObservation,
    pub(super) collision_reason: Option<LocalLogStorageAppendResolutionCollisionReason>,
}

impl LocalLogStorageAppendResolved {
    pub(super) const fn new(
        source: LocalLogStorageAppendResolutionSource,
        resolution_request_id: LocalLogStorageAppendResolutionRequestId,
        observation: LocalLogStorageAppendResolutionObservation,
        collision_reason: Option<LocalLogStorageAppendResolutionCollisionReason>,
    ) -> Self {
        Self { source, resolution_request_id, observation, collision_reason }
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

    /// Returns the original append request when the source emitted one.
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

    /// Returns the terminal physical finding category.
    #[must_use]
    pub const fn observation_kind(&self) -> LocalLogStorageAppendResolutionObservationKind {
        self.observation.kind()
    }

    /// Returns the completed terminal physical finding.
    pub const fn observation(&self) -> &LocalLogStorageAppendResolutionObservation {
        &self.observation
    }

    /// Returns the bounded fail-closed reason when this is a collision outcome.
    #[must_use]
    pub const fn collision_reason(&self) -> Option<LocalLogStorageAppendResolutionCollisionReason> {
        self.collision_reason
    }
}

impl fmt::Debug for LocalLogStorageAppendResolved {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("LocalLogStorageAppendResolved")
            .field("source_kind", &self.source_kind())
            .field("source_attempt_id", self.source_attempt_id())
            .field("source_append_request_id", &self.source_append_request_id())
            .field("resolution_request_id", &self.resolution_request_id)
            .field("observation", &self.observation)
            .field("collision_reason", &self.collision_reason)
            .field("queue", self.queue())
            .finish_non_exhaustive()
    }
}

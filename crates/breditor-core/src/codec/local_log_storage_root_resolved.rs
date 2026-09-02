use std::fmt;

use crate::local_log::LocalLogStorageAttemptId;

use super::{
    LocalLogStorageRootResolutionCollisionReason, LocalLogStorageRootResolutionObservation,
    LocalLogStorageRootResolutionObservationKind, LocalLogStorageRootResolutionSourceKind,
    LocalLogStorageSelectedBinding, LocalLogStorageSelectionReceiptBinding,
    local_log_storage_root_resolution_source::LocalLogStorageRootResolutionSource,
};

/// One terminal, non-retry root-resolution classification payload.
///
/// The outer [`LocalLogStorageRootResolutionOutcome`](super::LocalLogStorageRootResolutionOutcome)
/// names the semantic classification. This opaque value retains the exact
/// original attempt state, plan allocations, terminal physical observation,
/// and optional payload-free collision reason. It exposes no raw candidate
/// JSON, retry transition, writer authority, durability promise, currentness,
/// checkpoint anchor, or successor owner.
///
/// ```compile_fail
/// fn retry(value: breditor_core::codec::LocalLogStorageRootResolved) {
///     let _ = value.begin_exact_resubmission();
/// }
/// ```
#[must_use = "a resolved root classification must be explicitly retained or inspected"]
pub struct LocalLogStorageRootResolved {
    pub(super) source: LocalLogStorageRootResolutionSource,
    pub(super) observation: LocalLogStorageRootResolutionObservation,
    pub(super) collision_reason: Option<LocalLogStorageRootResolutionCollisionReason>,
}

impl LocalLogStorageRootResolved {
    pub(super) const fn new(
        source: LocalLogStorageRootResolutionSource,
        observation: LocalLogStorageRootResolutionObservation,
        collision_reason: Option<LocalLogStorageRootResolutionCollisionReason>,
    ) -> Self {
        Self { source, observation, collision_reason }
    }

    /// Returns the exact attempt-state case that entered resolution.
    #[must_use]
    pub const fn source_kind(&self) -> LocalLogStorageRootResolutionSourceKind {
        self.source.kind()
    }

    /// Returns the original physical-attempt correlation identity.
    #[must_use]
    pub const fn source_attempt_id(&self) -> &LocalLogStorageAttemptId {
        self.source.attempt_id()
    }

    /// Returns the prospective candidate receipt retained by the exact plan.
    #[must_use]
    pub const fn candidate_receipt(&self) -> &LocalLogStorageSelectionReceiptBinding {
        self.source.plan().candidate_receipt()
    }

    /// Returns the complete prospective candidate binding retained by the plan.
    #[must_use]
    pub const fn candidate_binding(&self) -> &LocalLogStorageSelectedBinding {
        self.source.plan().candidate_binding()
    }

    /// Returns the byte length of the exact retained candidate JSON.
    #[must_use]
    pub fn candidate_json_bytes(&self) -> usize {
        self.source.plan().candidate_json_bytes()
    }

    /// Returns the terminal physical/profile finding category.
    #[must_use]
    pub const fn observation_kind(&self) -> LocalLogStorageRootResolutionObservationKind {
        self.observation.kind()
    }

    /// Returns the terminal physical/profile finding.
    pub const fn observation(&self) -> &LocalLogStorageRootResolutionObservation {
        &self.observation
    }

    /// Returns the fixed fail-closed reason for a collision/corruption outcome.
    #[must_use]
    pub const fn collision_reason(&self) -> Option<LocalLogStorageRootResolutionCollisionReason> {
        self.collision_reason
    }
}

impl fmt::Debug for LocalLogStorageRootResolved {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("LocalLogStorageRootResolved")
            .field("source_kind", &self.source_kind())
            .field("source_attempt_id", self.source_attempt_id())
            .field("candidate_binding", self.candidate_binding())
            .field("candidate_json_bytes", &self.candidate_json_bytes())
            .field("observation", &self.observation)
            .field("collision_reason", &self.collision_reason)
            .finish_non_exhaustive()
    }
}

use std::fmt;

use crate::local_log::LocalLogStorageAttemptId;

use super::{
    LocalLogStorageRotationResolutionCollisionReason, LocalLogStorageRotationResolutionObservation,
    LocalLogStorageRotationResolutionObservationKind, LocalLogStorageRotationResolutionSourceKind,
    LocalLogStorageSelectedBinding, LocalLogStorageSelectionReceiptBinding,
    local_log_storage_rotation_resolution_source::LocalLogStorageRotationResolutionSource,
};

/// One terminal, non-retry rotation-resolution classification payload.
///
/// This retains the exact source plan and physical observation but exposes no
/// raw JSON, retry transition, writer authority, currentness, durability,
/// checkpoint anchor, or successor owner.
///
/// ```compile_fail
/// fn retry(value: breditor_core::codec::LocalLogStorageRotationResolved) {
///     let _ = value.begin_exact_resubmission();
/// }
/// ```
#[must_use = "a resolved rotation classification must be retained or inspected"]
pub struct LocalLogStorageRotationResolved {
    pub(super) source: LocalLogStorageRotationResolutionSource,
    pub(super) observation: LocalLogStorageRotationResolutionObservation,
    pub(super) collision_reason: Option<LocalLogStorageRotationResolutionCollisionReason>,
}

impl LocalLogStorageRotationResolved {
    pub(super) const fn new(
        source: LocalLogStorageRotationResolutionSource,
        observation: LocalLogStorageRotationResolutionObservation,
        collision_reason: Option<LocalLogStorageRotationResolutionCollisionReason>,
    ) -> Self {
        Self { source, observation, collision_reason }
    }

    /// Returns the exact attempt-state case that entered resolution.
    #[must_use]
    pub const fn source_kind(&self) -> LocalLogStorageRotationResolutionSourceKind {
        self.source.kind()
    }

    /// Returns the original physical-attempt identity.
    #[must_use]
    pub const fn source_attempt_id(&self) -> &LocalLogStorageAttemptId {
        self.source.attempt_id()
    }

    /// Returns the prospective candidate receipt retained by the exact plan.
    #[must_use]
    pub const fn candidate_receipt(&self) -> &LocalLogStorageSelectionReceiptBinding {
        self.source.plan().candidate_receipt()
    }

    /// Returns the complete prospective candidate binding.
    #[must_use]
    pub const fn candidate_binding(&self) -> &LocalLogStorageSelectedBinding {
        self.source.plan().candidate_binding()
    }

    /// Returns the complete exact prior selected binding.
    #[must_use]
    pub fn selected_binding(&self) -> &LocalLogStorageSelectedBinding {
        self.source.plan().validated_rotation_context().selected_binding()
    }

    /// Returns the retained candidate JSON byte length.
    #[must_use]
    pub fn candidate_json_bytes(&self) -> usize {
        self.source.plan().candidate_json_bytes()
    }

    /// Returns the retained prior current JSON byte length.
    #[must_use]
    pub fn selected_current_json_bytes(&self) -> usize {
        self.source.plan().validated_rotation_context().current_selection_json().len()
    }

    /// Returns the prior predecessor JSON byte length when present.
    #[must_use]
    pub fn selected_predecessor_json_bytes(&self) -> Option<usize> {
        self.source.plan().selected_predecessor_json_bytes()
    }

    /// Returns the terminal physical finding category.
    #[must_use]
    pub const fn observation_kind(&self) -> LocalLogStorageRotationResolutionObservationKind {
        self.observation.kind()
    }

    /// Returns the terminal physical finding.
    pub const fn observation(&self) -> &LocalLogStorageRotationResolutionObservation {
        &self.observation
    }

    /// Returns the fail-closed reason for a collision/corruption outcome.
    #[must_use]
    pub const fn collision_reason(
        &self,
    ) -> Option<LocalLogStorageRotationResolutionCollisionReason> {
        self.collision_reason
    }
}

impl fmt::Debug for LocalLogStorageRotationResolved {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("LocalLogStorageRotationResolved")
            .field("source_kind", &self.source_kind())
            .field("source_attempt_id", self.source_attempt_id())
            .field("candidate_binding", self.candidate_binding())
            .field("candidate_json_bytes", &self.candidate_json_bytes())
            .field("selected_binding", self.selected_binding())
            .field("selected_current_json_bytes", &self.selected_current_json_bytes())
            .field("selected_predecessor_json_bytes", &self.selected_predecessor_json_bytes())
            .field("observation", &self.observation)
            .field("collision_reason", &self.collision_reason)
            .finish_non_exhaustive()
    }
}

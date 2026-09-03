use std::fmt;

use crate::local_log::LocalLogStorageAttemptId;

use super::{
    LocalLogStorageAttemptAborted, LocalLogStorageNotAttempted,
    LocalLogStorageRotationResolutionSourceKind, LocalLogStorageSelectedBinding,
    LocalLogStorageSelectionReceiptBinding, LocalLogStorageUncertainAttempt,
    local_log_storage_attempt_plan::LocalLogStorageAttemptPlan,
};

/// Advisory exact-resubmission state after clean completed rotation resolution.
///
/// This type is structurally unable to contain `HostAttestedCommitted`.
/// Eligibility remains only a completed-read snapshot: copied request bytes may
/// publish later, and any new attempt must repeat all comparisons and authority
/// checks.
///
/// ```compile_fail
/// fn require_clone<T: Clone>() {}
/// require_clone::<breditor_core::codec::LocalLogStorageRotationRetryEligibleAtResolution>();
/// ```
#[must_use = "rotation retry eligibility must be retained, resubmitted, or discarded"]
pub struct LocalLogStorageRotationRetryEligibleAtResolution {
    pub(super) source: LocalLogStorageRotationRetrySource,
}

impl LocalLogStorageRotationRetryEligibleAtResolution {
    pub(super) const fn new(source: LocalLogStorageRotationRetrySource) -> Self {
        Self { source }
    }

    /// Returns the non-host-committed source state.
    #[must_use]
    pub const fn source_kind(&self) -> LocalLogStorageRotationResolutionSourceKind {
        self.source.kind()
    }

    /// Returns the original physical-attempt identity.
    #[must_use]
    pub const fn source_attempt_id(&self) -> &LocalLogStorageAttemptId {
        self.source.attempt_id()
    }

    /// Returns the exact prospective candidate receipt.
    #[must_use]
    pub const fn candidate_receipt(&self) -> &LocalLogStorageSelectionReceiptBinding {
        self.source.plan().candidate_receipt()
    }

    /// Returns the exact prospective candidate binding.
    #[must_use]
    pub const fn candidate_binding(&self) -> &LocalLogStorageSelectedBinding {
        self.source.plan().candidate_binding()
    }

    /// Returns the complete exact prior selected binding.
    #[must_use]
    pub fn selected_binding(&self) -> &LocalLogStorageSelectedBinding {
        self.source.plan().validated_rotation_context().selected_binding()
    }

    /// Returns the exact candidate JSON byte length.
    #[must_use]
    pub fn candidate_json_bytes(&self) -> usize {
        self.source.plan().candidate_json_bytes()
    }

    /// Returns the exact prior current JSON byte length.
    #[must_use]
    pub fn selected_current_json_bytes(&self) -> usize {
        self.source.plan().validated_rotation_context().current_selection_json().len()
    }

    /// Returns the prior predecessor JSON byte length when present.
    #[must_use]
    pub fn selected_predecessor_json_bytes(&self) -> Option<usize> {
        self.source.plan().selected_predecessor_json_bytes()
    }
}

impl fmt::Debug for LocalLogStorageRotationRetryEligibleAtResolution {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("LocalLogStorageRotationRetryEligibleAtResolution")
            .field("source_kind", &self.source_kind())
            .field("source_attempt_id", self.source_attempt_id())
            .field("candidate_binding", self.candidate_binding())
            .field("candidate_json_bytes", &self.candidate_json_bytes())
            .field("selected_binding", self.selected_binding())
            .field("selected_current_json_bytes", &self.selected_current_json_bytes())
            .field("selected_predecessor_json_bytes", &self.selected_predecessor_json_bytes())
            .finish_non_exhaustive()
    }
}

pub(super) enum LocalLogStorageRotationRetrySource {
    Uncertain(LocalLogStorageUncertainAttempt),
    AttemptAborted(LocalLogStorageAttemptAborted),
    NotAttempted(LocalLogStorageNotAttempted),
}

impl LocalLogStorageRotationRetrySource {
    pub(super) const fn kind(&self) -> LocalLogStorageRotationResolutionSourceKind {
        match self {
            Self::Uncertain(_) => LocalLogStorageRotationResolutionSourceKind::Uncertain,
            Self::AttemptAborted(_) => LocalLogStorageRotationResolutionSourceKind::AttemptAborted,
            Self::NotAttempted(_) => LocalLogStorageRotationResolutionSourceKind::NotAttempted,
        }
    }

    pub(super) const fn attempt_id(&self) -> &LocalLogStorageAttemptId {
        match self {
            Self::Uncertain(owner) => owner.attempt_id(),
            Self::AttemptAborted(owner) => owner.attempt_id(),
            Self::NotAttempted(owner) => owner.attempt_id(),
        }
    }

    pub(super) const fn plan(&self) -> &LocalLogStorageAttemptPlan {
        match self {
            Self::Uncertain(owner) => &owner.plan,
            Self::AttemptAborted(owner) => owner.retained.plan(),
            Self::NotAttempted(owner) => owner.retained.plan(),
        }
    }

    pub(super) fn into_plan(self) -> LocalLogStorageAttemptPlan {
        match self {
            Self::Uncertain(owner) => owner.plan,
            Self::AttemptAborted(owner) => owner.retained.into_plan(),
            Self::NotAttempted(owner) => owner.retained.into_plan(),
        }
    }
}

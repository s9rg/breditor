use std::fmt;

use crate::local_log::LocalLogStorageAttemptId;

use super::{
    LocalLogStorageAttemptAborted, LocalLogStorageNotAttempted,
    LocalLogStorageRootResolutionSourceKind, LocalLogStorageSelectedBinding,
    LocalLogStorageSelectionReceiptBinding, LocalLogStorageUncertainAttempt,
    local_log_storage_attempt_plan::LocalLogStorageAttemptPlan,
};

/// Advisory exact-resubmission state after one clean completed root read.
///
/// This type is structurally unable to contain `HostAttestedCommitted`. It
/// owns only an uncertain, physically aborted, or physically unattempted source
/// whose completed resolver transaction found the planned scope and all
/// complete scope artifact ranges absent in the expected database incarnation.
/// The result is advisory outside that transaction: copied request bytes can
/// still publish later, and a subsequent adapter attempt must repeat every
/// storage comparison and authority check.
///
/// ```compile_fail
/// fn require_clone<T: Clone>() {}
/// require_clone::<breditor_core::codec::LocalLogStorageRootRetryEligibleAtResolution>();
/// ```
#[must_use = "root retry eligibility must be retained, resubmitted, or deliberately discarded"]
pub struct LocalLogStorageRootRetryEligibleAtResolution {
    pub(super) source: LocalLogStorageRootRetrySource,
}

impl LocalLogStorageRootRetryEligibleAtResolution {
    pub(super) const fn new(source: LocalLogStorageRootRetrySource) -> Self {
        Self { source }
    }

    /// Returns the non-host-committed source state.
    #[must_use]
    pub const fn source_kind(&self) -> LocalLogStorageRootResolutionSourceKind {
        self.source.kind()
    }

    /// Returns the original physical-attempt correlation identity.
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

    /// Returns the byte length of the exact canonical candidate JSON.
    #[must_use]
    pub fn candidate_json_bytes(&self) -> usize {
        self.source.plan().candidate_json_bytes()
    }
}

impl fmt::Debug for LocalLogStorageRootRetryEligibleAtResolution {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("LocalLogStorageRootRetryEligibleAtResolution")
            .field("source_kind", &self.source_kind())
            .field("source_attempt_id", self.source_attempt_id())
            .field("candidate_binding", self.candidate_binding())
            .field("candidate_json_bytes", &self.candidate_json_bytes())
            .finish_non_exhaustive()
    }
}

pub(super) enum LocalLogStorageRootRetrySource {
    Uncertain(LocalLogStorageUncertainAttempt),
    AttemptAborted(LocalLogStorageAttemptAborted),
    NotAttempted(LocalLogStorageNotAttempted),
}

impl LocalLogStorageRootRetrySource {
    pub(super) const fn kind(&self) -> LocalLogStorageRootResolutionSourceKind {
        match self {
            Self::Uncertain(_) => LocalLogStorageRootResolutionSourceKind::Uncertain,
            Self::AttemptAborted(_) => LocalLogStorageRootResolutionSourceKind::AttemptAborted,
            Self::NotAttempted(_) => LocalLogStorageRootResolutionSourceKind::NotAttempted,
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

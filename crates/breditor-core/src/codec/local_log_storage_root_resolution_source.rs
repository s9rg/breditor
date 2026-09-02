use crate::local_log::LocalLogStorageAttemptId;

use super::{
    local_log_storage_attempt_aborted::LocalLogStorageAttemptAborted,
    local_log_storage_attempt_plan::LocalLogStorageAttemptPlan,
    local_log_storage_host_attested_committed::LocalLogStorageHostAttestedCommitted,
    local_log_storage_not_attempted::LocalLogStorageNotAttempted,
    local_log_storage_root_resolution_source_kind::LocalLogStorageRootResolutionSourceKind,
    local_log_storage_uncertain_attempt::LocalLogStorageUncertainAttempt,
};

/// Exact attempt state retained behind one root-resolution owner.
///
/// Keeping the original state object, rather than projecting it to a common
/// plan, lets later case-specific outcomes return the exact source ownership.
pub(super) enum LocalLogStorageRootResolutionSource {
    Uncertain(LocalLogStorageUncertainAttempt),
    AttemptAborted(LocalLogStorageAttemptAborted),
    NotAttempted(LocalLogStorageNotAttempted),
    HostAttestedCommitted(LocalLogStorageHostAttestedCommitted),
}

impl LocalLogStorageRootResolutionSource {
    pub(super) const fn kind(&self) -> LocalLogStorageRootResolutionSourceKind {
        match self {
            Self::Uncertain(_) => LocalLogStorageRootResolutionSourceKind::Uncertain,
            Self::AttemptAborted(_) => LocalLogStorageRootResolutionSourceKind::AttemptAborted,
            Self::NotAttempted(_) => LocalLogStorageRootResolutionSourceKind::NotAttempted,
            Self::HostAttestedCommitted(_) => {
                LocalLogStorageRootResolutionSourceKind::HostAttestedCommitted
            }
        }
    }

    pub(super) const fn attempt_id(&self) -> &LocalLogStorageAttemptId {
        match self {
            Self::Uncertain(owner) => owner.attempt_id(),
            Self::AttemptAborted(owner) => owner.attempt_id(),
            Self::NotAttempted(owner) => owner.attempt_id(),
            Self::HostAttestedCommitted(owner) => owner.attempt_id(),
        }
    }

    pub(super) const fn plan(&self) -> &LocalLogStorageAttemptPlan {
        match self {
            Self::Uncertain(owner) => &owner.plan,
            Self::AttemptAborted(owner) => owner.retained.plan(),
            Self::NotAttempted(owner) => owner.retained.plan(),
            Self::HostAttestedCommitted(owner) => owner.retained.plan(),
        }
    }
}

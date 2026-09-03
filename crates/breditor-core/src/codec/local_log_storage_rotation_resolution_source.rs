use crate::local_log::LocalLogStorageAttemptId;

use super::{
    local_log_storage_attempt_aborted::LocalLogStorageAttemptAborted,
    local_log_storage_attempt_plan::LocalLogStorageAttemptPlan,
    local_log_storage_host_attested_committed::LocalLogStorageHostAttestedCommitted,
    local_log_storage_not_attempted::LocalLogStorageNotAttempted,
    local_log_storage_rotation_resolution_source_kind::LocalLogStorageRotationResolutionSourceKind,
    local_log_storage_uncertain_attempt::LocalLogStorageUncertainAttempt,
};

/// Exact attempt state retained behind one rotation-resolution owner.
pub(super) enum LocalLogStorageRotationResolutionSource {
    Uncertain(LocalLogStorageUncertainAttempt),
    AttemptAborted(LocalLogStorageAttemptAborted),
    NotAttempted(LocalLogStorageNotAttempted),
    HostAttestedCommitted(LocalLogStorageHostAttestedCommitted),
}

impl LocalLogStorageRotationResolutionSource {
    pub(super) const fn kind(&self) -> LocalLogStorageRotationResolutionSourceKind {
        match self {
            Self::Uncertain(_) => LocalLogStorageRotationResolutionSourceKind::Uncertain,
            Self::AttemptAborted(_) => LocalLogStorageRotationResolutionSourceKind::AttemptAborted,
            Self::NotAttempted(_) => LocalLogStorageRotationResolutionSourceKind::NotAttempted,
            Self::HostAttestedCommitted(_) => {
                LocalLogStorageRotationResolutionSourceKind::HostAttestedCommitted
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

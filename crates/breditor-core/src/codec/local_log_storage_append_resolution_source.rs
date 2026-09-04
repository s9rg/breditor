use crate::local_log::{LocalLogStorageAppendAttemptId, LocalLogStorageAppendRequestId};

use super::{
    LocalLogStorageAppendAttemptAborted, LocalLogStorageAppendNotAttempted,
    LocalLogStorageAppendQueue, LocalLogStorageUncertainAppendAttempt,
    local_log_storage_append_resolution_source_kind::LocalLogStorageAppendResolutionSourceKind,
    local_log_storage_issued_append_attempt::LocalLogStorageIssuedAppendAttempt,
    local_log_storage_retained_append_attempt::{
        LocalLogStorageRetainedAppendAttempt, LocalLogStorageRetainedAppendAttemptCorrelation,
    },
    local_log_storage_uncertain_append_attempt::LocalLogStorageUncertainAppendAttemptParts,
};

/// Exact queue-owning attempt state retained behind one append resolver.
pub(super) enum LocalLogStorageAppendResolutionSource {
    Uncertain(LocalLogStorageUncertainAppendAttempt),
    AttemptAborted(LocalLogStorageAppendAttemptAborted),
    NotAttempted(LocalLogStorageAppendNotAttempted),
}

pub(super) struct LocalLogStorageAppendResolutionSourceParts {
    pub(super) queue: LocalLogStorageAppendQueue,
    pub(super) provenance: LocalLogStorageAppendResolutionSourceProvenance,
}

pub(super) enum LocalLogStorageAppendResolutionSourceProvenance {
    Uncertain {
        attempt_id: LocalLogStorageAppendAttemptId,
        request_id: Option<LocalLogStorageAppendRequestId>,
    },
    AttemptAborted {
        request_id: LocalLogStorageAppendRequestId,
    },
    NotAttempted {
        correlation: LocalLogStorageRetainedAppendAttemptCorrelation,
    },
}

impl LocalLogStorageAppendResolutionSource {
    pub(super) fn from_parts(parts: LocalLogStorageAppendResolutionSourceParts) -> Self {
        let LocalLogStorageAppendResolutionSourceParts { queue, provenance } = parts;
        match provenance {
            LocalLogStorageAppendResolutionSourceProvenance::Uncertain {
                attempt_id,
                request_id,
            } => Self::Uncertain(LocalLogStorageUncertainAppendAttempt::from_parts(
                LocalLogStorageUncertainAppendAttemptParts { queue, attempt_id, request_id },
            )),
            LocalLogStorageAppendResolutionSourceProvenance::AttemptAborted { request_id } => {
                Self::AttemptAborted(LocalLogStorageAppendAttemptAborted::new(
                    LocalLogStorageIssuedAppendAttempt::new(queue, request_id),
                ))
            }
            LocalLogStorageAppendResolutionSourceProvenance::NotAttempted { correlation } => {
                Self::NotAttempted(LocalLogStorageAppendNotAttempted::new(
                    LocalLogStorageRetainedAppendAttempt::from_parts(queue, correlation),
                ))
            }
        }
    }

    pub(super) fn into_parts(self) -> LocalLogStorageAppendResolutionSourceParts {
        match self {
            Self::Uncertain(owner) => {
                let LocalLogStorageUncertainAppendAttemptParts { queue, attempt_id, request_id } =
                    owner.into_parts();
                LocalLogStorageAppendResolutionSourceParts {
                    queue,
                    provenance: LocalLogStorageAppendResolutionSourceProvenance::Uncertain {
                        attempt_id,
                        request_id,
                    },
                }
            }
            Self::AttemptAborted(owner) => {
                let (queue, request_id) = owner.retained.into_parts();
                LocalLogStorageAppendResolutionSourceParts {
                    queue,
                    provenance: LocalLogStorageAppendResolutionSourceProvenance::AttemptAborted {
                        request_id,
                    },
                }
            }
            Self::NotAttempted(owner) => {
                let (queue, correlation) = owner.retained.into_parts();
                LocalLogStorageAppendResolutionSourceParts {
                    queue,
                    provenance: LocalLogStorageAppendResolutionSourceProvenance::NotAttempted {
                        correlation,
                    },
                }
            }
        }
    }

    pub(super) const fn kind(&self) -> LocalLogStorageAppendResolutionSourceKind {
        match self {
            Self::Uncertain(_) => LocalLogStorageAppendResolutionSourceKind::Uncertain,
            Self::AttemptAborted(_) => LocalLogStorageAppendResolutionSourceKind::AttemptAborted,
            Self::NotAttempted(_) => LocalLogStorageAppendResolutionSourceKind::NotAttempted,
        }
    }

    pub(super) const fn attempt_id(&self) -> &LocalLogStorageAppendAttemptId {
        match self {
            Self::Uncertain(owner) => owner.attempt_id(),
            Self::AttemptAborted(owner) => owner.attempt_id(),
            Self::NotAttempted(owner) => owner.attempt_id(),
        }
    }

    pub(super) const fn append_request_id(&self) -> Option<&LocalLogStorageAppendRequestId> {
        match self {
            Self::Uncertain(owner) => owner.request_id.as_ref(),
            Self::AttemptAborted(owner) => Some(owner.request_id()),
            Self::NotAttempted(owner) => owner.retained.request_id(),
        }
    }

    pub(super) const fn queue(&self) -> &LocalLogStorageAppendQueue {
        match self {
            Self::Uncertain(owner) => owner.queue(),
            Self::AttemptAborted(owner) => owner.queue(),
            Self::NotAttempted(owner) => owner.queue(),
        }
    }

    /// Recovers the allocation-identical queue from any retained provenance.
    pub(super) fn into_queue(self) -> LocalLogStorageAppendQueue {
        match self {
            Self::Uncertain(owner) => owner.into_parts().queue,
            Self::AttemptAborted(owner) => owner.retained.into_parts().0,
            Self::NotAttempted(owner) => owner.retained.into_queue(),
        }
    }
}

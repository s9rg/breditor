use thiserror::Error;

/// Stable category for an invalid rotation-resolution state transition.
#[non_exhaustive]
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub enum LocalLogStorageRotationResolutionTransitionErrorCode {
    /// This resolver invocation already yielded its request view.
    RequestAlreadyIssued,
    /// Completed evidence was supplied before request egress.
    RequestNotIssued,
    /// Completed evidence names a different resolver request.
    RequestIdMismatch,
}

impl LocalLogStorageRotationResolutionTransitionErrorCode {
    /// Returns the stable namespaced error code.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::RequestAlreadyIssued => {
                "local_log_storage_rotation_resolution_transition.request_already_issued"
            }
            Self::RequestNotIssued => {
                "local_log_storage_rotation_resolution_transition.request_not_issued"
            }
            Self::RequestIdMismatch => {
                "local_log_storage_rotation_resolution_transition.request_id_mismatch"
            }
        }
    }
}

/// Payload-free rejection of a rotation-resolution state transition.
#[non_exhaustive]
#[derive(Clone, Copy, Debug, Eq, Error, Hash, Ord, PartialEq, PartialOrd)]
pub enum LocalLogStorageRotationResolutionTransitionError {
    /// One resolver invocation yields at most one adapter request view.
    #[error("rotation storage resolution already yielded its adapter request")]
    RequestAlreadyIssued,
    /// Resolver completion cannot precede request egress.
    #[error("rotation storage resolution has not yielded its adapter request")]
    RequestNotIssued,
    /// The supplied token does not name the emitted request.
    #[error("rotation storage-resolution correlation does not match the emitted request")]
    RequestIdMismatch,
}

impl LocalLogStorageRotationResolutionTransitionError {
    /// Returns the stable machine-readable failure category.
    #[must_use]
    pub const fn code(self) -> LocalLogStorageRotationResolutionTransitionErrorCode {
        match self {
            Self::RequestAlreadyIssued => {
                LocalLogStorageRotationResolutionTransitionErrorCode::RequestAlreadyIssued
            }
            Self::RequestNotIssued => {
                LocalLogStorageRotationResolutionTransitionErrorCode::RequestNotIssued
            }
            Self::RequestIdMismatch => {
                LocalLogStorageRotationResolutionTransitionErrorCode::RequestIdMismatch
            }
        }
    }
}

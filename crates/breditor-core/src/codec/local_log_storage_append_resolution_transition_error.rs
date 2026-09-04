use thiserror::Error;

/// Stable category for an invalid append-resolution state transition.
#[non_exhaustive]
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub enum LocalLogStorageAppendResolutionTransitionErrorCode {
    /// This resolver invocation already yielded its request view.
    RequestAlreadyIssued,
    /// Terminal evidence was supplied before resolver request egress.
    RequestNotIssued,
    /// Terminal evidence names another resolver invocation.
    RequestIdMismatch,
}

impl LocalLogStorageAppendResolutionTransitionErrorCode {
    /// Returns the stable namespaced error code.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::RequestAlreadyIssued => {
                "local_log_storage_append_resolution_transition.request_already_issued"
            }
            Self::RequestNotIssued => {
                "local_log_storage_append_resolution_transition.request_not_issued"
            }
            Self::RequestIdMismatch => {
                "local_log_storage_append_resolution_transition.request_id_mismatch"
            }
        }
    }
}

/// Payload-free rejection of an append-resolution state transition.
#[non_exhaustive]
#[derive(Clone, Copy, Debug, Eq, Error, Hash, Ord, PartialEq, PartialOrd)]
pub enum LocalLogStorageAppendResolutionTransitionError {
    /// One resolver invocation yields at most one adapter request view.
    #[error("append storage resolution already yielded its adapter request")]
    RequestAlreadyIssued,
    /// Resolver evidence cannot precede request egress.
    #[error("append storage resolution has not yielded its adapter request")]
    RequestNotIssued,
    /// The supplied correlation identity does not name the emitted request.
    #[error("append storage-resolution correlation does not match the emitted request")]
    RequestIdMismatch,
}

impl LocalLogStorageAppendResolutionTransitionError {
    /// Returns the stable machine-readable failure category.
    #[must_use]
    pub const fn code(self) -> LocalLogStorageAppendResolutionTransitionErrorCode {
        match self {
            Self::RequestAlreadyIssued => {
                LocalLogStorageAppendResolutionTransitionErrorCode::RequestAlreadyIssued
            }
            Self::RequestNotIssued => {
                LocalLogStorageAppendResolutionTransitionErrorCode::RequestNotIssued
            }
            Self::RequestIdMismatch => {
                LocalLogStorageAppendResolutionTransitionErrorCode::RequestIdMismatch
            }
        }
    }
}

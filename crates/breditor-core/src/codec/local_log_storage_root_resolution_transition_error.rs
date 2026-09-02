use thiserror::Error;

/// Stable category for an invalid root-resolution state transition.
#[non_exhaustive]
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub enum LocalLogStorageRootResolutionTransitionErrorCode {
    /// This resolver invocation already yielded its request view.
    RequestAlreadyIssued,
    /// Completed evidence was supplied before request egress.
    RequestNotIssued,
    /// Completed evidence names a different resolver request.
    RequestIdMismatch,
}

impl LocalLogStorageRootResolutionTransitionErrorCode {
    /// Returns the stable namespaced error code.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::RequestAlreadyIssued => {
                "local_log_storage_root_resolution_transition.request_already_issued"
            }
            Self::RequestNotIssued => {
                "local_log_storage_root_resolution_transition.request_not_issued"
            }
            Self::RequestIdMismatch => {
                "local_log_storage_root_resolution_transition.request_id_mismatch"
            }
        }
    }
}

/// Payload-free rejection of a root-resolution state transition.
#[non_exhaustive]
#[derive(Clone, Copy, Debug, Eq, Error, Hash, Ord, PartialEq, PartialOrd)]
pub enum LocalLogStorageRootResolutionTransitionError {
    /// One resolver invocation yields at most one adapter request view.
    #[error("root storage resolution already yielded its adapter request")]
    RequestAlreadyIssued,
    /// Resolver completion cannot precede request egress.
    #[error("root storage resolution has not yielded its adapter request")]
    RequestNotIssued,
    /// The supplied correlation token does not name the emitted request.
    #[error("root storage-resolution correlation does not match the emitted request")]
    RequestIdMismatch,
}

impl LocalLogStorageRootResolutionTransitionError {
    /// Returns the stable machine-readable failure category.
    #[must_use]
    pub const fn code(self) -> LocalLogStorageRootResolutionTransitionErrorCode {
        match self {
            Self::RequestAlreadyIssued => {
                LocalLogStorageRootResolutionTransitionErrorCode::RequestAlreadyIssued
            }
            Self::RequestNotIssued => {
                LocalLogStorageRootResolutionTransitionErrorCode::RequestNotIssued
            }
            Self::RequestIdMismatch => {
                LocalLogStorageRootResolutionTransitionErrorCode::RequestIdMismatch
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use std::error::Error as _;

    use super::{
        LocalLogStorageRootResolutionTransitionError,
        LocalLogStorageRootResolutionTransitionErrorCode,
    };

    #[test]
    fn transition_codes_are_stable_and_payload_free() {
        for (error, code, spelling) in [
            (
                LocalLogStorageRootResolutionTransitionError::RequestAlreadyIssued,
                LocalLogStorageRootResolutionTransitionErrorCode::RequestAlreadyIssued,
                "local_log_storage_root_resolution_transition.request_already_issued",
            ),
            (
                LocalLogStorageRootResolutionTransitionError::RequestNotIssued,
                LocalLogStorageRootResolutionTransitionErrorCode::RequestNotIssued,
                "local_log_storage_root_resolution_transition.request_not_issued",
            ),
            (
                LocalLogStorageRootResolutionTransitionError::RequestIdMismatch,
                LocalLogStorageRootResolutionTransitionErrorCode::RequestIdMismatch,
                "local_log_storage_root_resolution_transition.request_id_mismatch",
            ),
        ] {
            assert_eq!(error.code(), code);
            assert_eq!(code.as_str(), spelling);
            assert!(error.source().is_none());
            assert!(!format!("{error:?}").contains("PAYLOADSENTINEL"));
            assert!(!error.to_string().contains("PAYLOADSENTINEL"));
        }
    }
}

use thiserror::Error;

/// Stable category for an invalid exact-attempt state transition.
#[non_exhaustive]
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub enum LocalLogStorageAttemptTransitionErrorCode {
    /// Evidence or correlation named an attempt other than the retained one.
    AttemptIdMismatch,
    /// One physical attempt already yielded its request view.
    RequestAlreadyBorrowed,
    /// Transaction terminal evidence was supplied before request egress.
    RequestNotIssued,
    /// Terminal evidence names a different emitted request.
    RequestIdMismatch,
}

impl LocalLogStorageAttemptTransitionErrorCode {
    /// Returns the stable namespaced error code.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::AttemptIdMismatch => "local_log_storage_attempt_transition.attempt_id_mismatch",
            Self::RequestAlreadyBorrowed => {
                "local_log_storage_attempt_transition.request_already_borrowed"
            }
            Self::RequestNotIssued => "local_log_storage_attempt_transition.request_not_issued",
            Self::RequestIdMismatch => "local_log_storage_attempt_transition.request_id_mismatch",
        }
    }
}

/// Payload-free rejection of one physical-attempt state transition.
#[non_exhaustive]
#[derive(Clone, Copy, Debug, Eq, Error, Hash, Ord, PartialEq, PartialOrd)]
pub enum LocalLogStorageAttemptTransitionError {
    /// The supplied correlation ID does not name the retained physical attempt.
    #[error("storage-attempt correlation does not match the current attempt")]
    AttemptIdMismatch,
    /// A physical attempt yields at most one borrowed adapter request view.
    #[error("storage attempt already yielded its adapter request")]
    RequestAlreadyBorrowed,
    /// A transaction cannot terminate for an attempt whose request never left.
    #[error("storage attempt has not yielded its adapter request")]
    RequestNotIssued,
    /// The supplied request-issued token does not name the retained request.
    #[error("storage-attempt request correlation does not match the emitted request")]
    RequestIdMismatch,
}

impl LocalLogStorageAttemptTransitionError {
    /// Returns the stable machine-readable failure category.
    #[must_use]
    pub const fn code(self) -> LocalLogStorageAttemptTransitionErrorCode {
        match self {
            Self::AttemptIdMismatch => LocalLogStorageAttemptTransitionErrorCode::AttemptIdMismatch,
            Self::RequestAlreadyBorrowed => {
                LocalLogStorageAttemptTransitionErrorCode::RequestAlreadyBorrowed
            }
            Self::RequestNotIssued => LocalLogStorageAttemptTransitionErrorCode::RequestNotIssued,
            Self::RequestIdMismatch => LocalLogStorageAttemptTransitionErrorCode::RequestIdMismatch,
        }
    }
}

#[cfg(test)]
mod tests {
    use std::error::Error as _;

    use super::{LocalLogStorageAttemptTransitionError, LocalLogStorageAttemptTransitionErrorCode};

    #[test]
    fn transition_codes_are_stable() {
        assert_eq!(
            LocalLogStorageAttemptTransitionError::AttemptIdMismatch.code(),
            LocalLogStorageAttemptTransitionErrorCode::AttemptIdMismatch
        );
        assert_eq!(
            LocalLogStorageAttemptTransitionErrorCode::AttemptIdMismatch.as_str(),
            "local_log_storage_attempt_transition.attempt_id_mismatch"
        );
        assert_eq!(
            LocalLogStorageAttemptTransitionError::RequestAlreadyBorrowed.code(),
            LocalLogStorageAttemptTransitionErrorCode::RequestAlreadyBorrowed
        );
        assert_eq!(
            LocalLogStorageAttemptTransitionErrorCode::RequestAlreadyBorrowed.as_str(),
            "local_log_storage_attempt_transition.request_already_borrowed"
        );
        assert_eq!(
            LocalLogStorageAttemptTransitionError::RequestNotIssued.code(),
            LocalLogStorageAttemptTransitionErrorCode::RequestNotIssued
        );
        assert_eq!(
            LocalLogStorageAttemptTransitionErrorCode::RequestNotIssued.as_str(),
            "local_log_storage_attempt_transition.request_not_issued"
        );
        assert_eq!(
            LocalLogStorageAttemptTransitionError::RequestIdMismatch.code(),
            LocalLogStorageAttemptTransitionErrorCode::RequestIdMismatch
        );
        assert_eq!(
            LocalLogStorageAttemptTransitionErrorCode::RequestIdMismatch.as_str(),
            "local_log_storage_attempt_transition.request_id_mismatch"
        );
        for error in [
            LocalLogStorageAttemptTransitionError::AttemptIdMismatch,
            LocalLogStorageAttemptTransitionError::RequestAlreadyBorrowed,
            LocalLogStorageAttemptTransitionError::RequestNotIssued,
            LocalLogStorageAttemptTransitionError::RequestIdMismatch,
        ] {
            assert!(error.source().is_none());
            assert!(!format!("{error:?}").contains("PAYLOADSENTINEL"));
            assert!(!error.to_string().contains("PAYLOADSENTINEL"));
        }
    }
}

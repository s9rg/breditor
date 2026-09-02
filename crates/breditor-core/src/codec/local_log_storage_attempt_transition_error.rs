use thiserror::Error;

/// Stable category for an invalid exact-attempt state transition.
#[non_exhaustive]
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub enum LocalLogStorageAttemptTransitionErrorCode {
    /// Evidence or correlation named an attempt other than the retained one.
    AttemptIdMismatch,
    /// One physical attempt already yielded its request view.
    RequestAlreadyBorrowed,
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
        for error in [
            LocalLogStorageAttemptTransitionError::AttemptIdMismatch,
            LocalLogStorageAttemptTransitionError::RequestAlreadyBorrowed,
        ] {
            assert!(error.source().is_none());
            assert!(!format!("{error:?}").contains("PAYLOADSENTINEL"));
            assert!(!error.to_string().contains("PAYLOADSENTINEL"));
        }
    }
}

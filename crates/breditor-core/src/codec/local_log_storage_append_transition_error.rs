use thiserror::Error;

/// Stable category for an invalid queue-head append transition.
#[non_exhaustive]
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub enum LocalLogStorageAppendTransitionErrorCode {
    /// Evidence names an attempt other than the retained one.
    AttemptIdMismatch,
    /// The current physical attempt already emitted its one request.
    RequestAlreadyIssued,
    /// A transaction terminal event was supplied before request egress.
    RequestNotIssued,
    /// Terminal evidence names a different emitted request.
    RequestIdMismatch,
}

impl LocalLogStorageAppendTransitionErrorCode {
    /// Returns the stable namespaced error code.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::AttemptIdMismatch => "local_log_storage_append_transition.attempt_id_mismatch",
            Self::RequestAlreadyIssued => {
                "local_log_storage_append_transition.request_already_issued"
            }
            Self::RequestNotIssued => "local_log_storage_append_transition.request_not_issued",
            Self::RequestIdMismatch => "local_log_storage_append_transition.request_id_mismatch",
        }
    }
}

/// Payload-free rejection of a queue-head append lifecycle transition.
#[non_exhaustive]
#[derive(Clone, Copy, Debug, Eq, Error, Hash, Ord, PartialEq, PartialOrd)]
pub enum LocalLogStorageAppendTransitionError {
    /// The supplied correlation does not name the retained physical attempt.
    #[error("append correlation does not match the current attempt")]
    AttemptIdMismatch,
    /// One physical append attempt yields at most one adapter request.
    #[error("append attempt already yielded its adapter request")]
    RequestAlreadyIssued,
    /// A transaction cannot terminate before the request exists.
    #[error("append attempt has not yielded its adapter request")]
    RequestNotIssued,
    /// The supplied request correlation does not name the emitted request.
    #[error("append request does not match the emitted request")]
    RequestIdMismatch,
}

impl LocalLogStorageAppendTransitionError {
    /// Returns the stable machine-readable failure category.
    #[must_use]
    pub const fn code(self) -> LocalLogStorageAppendTransitionErrorCode {
        match self {
            Self::AttemptIdMismatch => LocalLogStorageAppendTransitionErrorCode::AttemptIdMismatch,
            Self::RequestAlreadyIssued => {
                LocalLogStorageAppendTransitionErrorCode::RequestAlreadyIssued
            }
            Self::RequestNotIssued => LocalLogStorageAppendTransitionErrorCode::RequestNotIssued,
            Self::RequestIdMismatch => LocalLogStorageAppendTransitionErrorCode::RequestIdMismatch,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{LocalLogStorageAppendTransitionError, LocalLogStorageAppendTransitionErrorCode};

    #[test]
    fn transition_error_codes_have_stable_namespaced_spellings() {
        for (error, code, spelling) in [
            (
                LocalLogStorageAppendTransitionError::AttemptIdMismatch,
                LocalLogStorageAppendTransitionErrorCode::AttemptIdMismatch,
                "local_log_storage_append_transition.attempt_id_mismatch",
            ),
            (
                LocalLogStorageAppendTransitionError::RequestAlreadyIssued,
                LocalLogStorageAppendTransitionErrorCode::RequestAlreadyIssued,
                "local_log_storage_append_transition.request_already_issued",
            ),
            (
                LocalLogStorageAppendTransitionError::RequestNotIssued,
                LocalLogStorageAppendTransitionErrorCode::RequestNotIssued,
                "local_log_storage_append_transition.request_not_issued",
            ),
            (
                LocalLogStorageAppendTransitionError::RequestIdMismatch,
                LocalLogStorageAppendTransitionErrorCode::RequestIdMismatch,
                "local_log_storage_append_transition.request_id_mismatch",
            ),
        ] {
            assert_eq!(error.code(), code);
            assert_eq!(code.as_str(), spelling);
        }
    }
}

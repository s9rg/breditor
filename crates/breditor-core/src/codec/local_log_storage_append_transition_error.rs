use thiserror::Error;

/// Stable category for an invalid queue-head append transition.
#[non_exhaustive]
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub enum LocalLogStorageAppendTransitionErrorCode {
    /// The current physical attempt already emitted its one request.
    RequestAlreadyIssued,
}

impl LocalLogStorageAppendTransitionErrorCode {
    /// Returns the stable namespaced error code.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::RequestAlreadyIssued => {
                "local_log_storage_append_transition.request_already_issued"
            }
        }
    }
}

/// Payload-free rejection of a queue-head append lifecycle transition.
#[non_exhaustive]
#[derive(Clone, Copy, Debug, Eq, Error, Hash, Ord, PartialEq, PartialOrd)]
pub enum LocalLogStorageAppendTransitionError {
    /// One physical append attempt yields at most one adapter request.
    #[error("append attempt already yielded its adapter request")]
    RequestAlreadyIssued,
}

impl LocalLogStorageAppendTransitionError {
    /// Returns the stable machine-readable failure category.
    #[must_use]
    pub const fn code(self) -> LocalLogStorageAppendTransitionErrorCode {
        match self {
            Self::RequestAlreadyIssued => {
                LocalLogStorageAppendTransitionErrorCode::RequestAlreadyIssued
            }
        }
    }
}

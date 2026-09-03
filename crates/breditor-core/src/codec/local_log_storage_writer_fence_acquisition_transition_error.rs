use thiserror::Error;

/// Stable category for an invalid writer-fence acquisition transition.
#[non_exhaustive]
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub enum LocalLogStorageWriterFenceAcquisitionTransitionErrorCode {
    /// Evidence names an attempt other than the retained one.
    AttemptIdMismatch,
    /// The attempt already emitted its one request.
    RequestAlreadyIssued,
    /// A transaction terminal event was supplied before request egress.
    RequestNotIssued,
    /// Terminal evidence names a different emitted request.
    RequestIdMismatch,
}

impl LocalLogStorageWriterFenceAcquisitionTransitionErrorCode {
    /// Returns the stable namespaced error code.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::AttemptIdMismatch => {
                "local_log_storage_writer_fence_acquisition_transition.attempt_id_mismatch"
            }
            Self::RequestAlreadyIssued => {
                "local_log_storage_writer_fence_acquisition_transition.request_already_issued"
            }
            Self::RequestNotIssued => {
                "local_log_storage_writer_fence_acquisition_transition.request_not_issued"
            }
            Self::RequestIdMismatch => {
                "local_log_storage_writer_fence_acquisition_transition.request_id_mismatch"
            }
        }
    }
}

/// Payload-free rejection of a writer-fence acquisition state transition.
#[non_exhaustive]
#[derive(Clone, Copy, Debug, Eq, Error, Hash, Ord, PartialEq, PartialOrd)]
pub enum LocalLogStorageWriterFenceAcquisitionTransitionError {
    /// The supplied correlation does not name the retained physical attempt.
    #[error("writer-fence acquisition correlation does not match the current attempt")]
    AttemptIdMismatch,
    /// One acquisition attempt yields at most one adapter request.
    #[error("writer-fence acquisition already yielded its adapter request")]
    RequestAlreadyIssued,
    /// A transaction cannot terminate before the request exists.
    #[error("writer-fence acquisition has not yielded its adapter request")]
    RequestNotIssued,
    /// The supplied request correlation does not name the emitted request.
    #[error("writer-fence acquisition request does not match the emitted request")]
    RequestIdMismatch,
}

impl LocalLogStorageWriterFenceAcquisitionTransitionError {
    /// Returns the stable machine-readable failure category.
    #[must_use]
    pub const fn code(self) -> LocalLogStorageWriterFenceAcquisitionTransitionErrorCode {
        match self {
            Self::AttemptIdMismatch => {
                LocalLogStorageWriterFenceAcquisitionTransitionErrorCode::AttemptIdMismatch
            }
            Self::RequestAlreadyIssued => {
                LocalLogStorageWriterFenceAcquisitionTransitionErrorCode::RequestAlreadyIssued
            }
            Self::RequestNotIssued => {
                LocalLogStorageWriterFenceAcquisitionTransitionErrorCode::RequestNotIssued
            }
            Self::RequestIdMismatch => {
                LocalLogStorageWriterFenceAcquisitionTransitionErrorCode::RequestIdMismatch
            }
        }
    }
}

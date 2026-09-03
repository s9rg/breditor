use std::{error::Error, fmt};

use super::{
    LocalLogStorageAppendQueueEnqueueError, LocalLogStorageAppendQueueEnqueueErrorCode,
    LocalLogStorageUncertainAppendAttempt,
};

/// Recoverable rejection of logical enqueue behind an uncertain append head.
///
/// The failure owns the complete unchanged uncertain attempt, including the
/// queue and its exact attempt/request correlation. The attempted
/// [`crate::local_log::LocalLogEntry`] was borrowed and remains caller-owned.
/// Diagnostics omit the owner and therefore all exact frame and selection
/// payloads.
#[must_use = "a rejected enqueue retains its complete uncertain append attempt"]
pub struct LocalLogStorageUncertainAppendEnqueueFailure {
    owner: Box<LocalLogStorageUncertainAppendAttempt>,
    error: LocalLogStorageAppendQueueEnqueueError,
}

impl LocalLogStorageUncertainAppendEnqueueFailure {
    pub(super) fn new(
        owner: LocalLogStorageUncertainAppendAttempt,
        error: LocalLogStorageAppendQueueEnqueueError,
    ) -> Self {
        Self { owner: Box::new(owner), error }
    }

    /// Returns the complete unchanged uncertain append attempt.
    pub const fn owner(&self) -> &LocalLogStorageUncertainAppendAttempt {
        &self.owner
    }

    /// Returns the typed queue-enqueue error.
    #[must_use]
    pub const fn error(&self) -> &LocalLogStorageAppendQueueEnqueueError {
        &self.error
    }

    /// Returns the stable machine-readable enqueue category.
    #[must_use]
    pub const fn code(&self) -> LocalLogStorageAppendQueueEnqueueErrorCode {
        self.error.code()
    }

    /// Recovers the complete unchanged uncertain append attempt.
    #[must_use = "the returned attempt retains queue authority and uncertainty"]
    pub fn into_owner(self) -> LocalLogStorageUncertainAppendAttempt {
        *self.owner
    }

    /// Separates the unchanged owner and typed enqueue error.
    #[must_use = "the returned attempt retains queue authority and uncertainty"]
    pub fn into_parts(
        self,
    ) -> (LocalLogStorageUncertainAppendAttempt, LocalLogStorageAppendQueueEnqueueError) {
        (*self.owner, self.error)
    }
}

impl fmt::Debug for LocalLogStorageUncertainAppendEnqueueFailure {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("LocalLogStorageUncertainAppendEnqueueFailure")
            .field("error", &self.error)
            .finish_non_exhaustive()
    }
}

impl fmt::Display for LocalLogStorageUncertainAppendEnqueueFailure {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.error.fmt(formatter)
    }
}

impl Error for LocalLogStorageUncertainAppendEnqueueFailure {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        Some(&self.error)
    }
}

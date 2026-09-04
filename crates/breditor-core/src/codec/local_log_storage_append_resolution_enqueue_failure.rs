use std::{error::Error, fmt};

use super::{
    LocalLogStorageAppendQueueEnqueueError, LocalLogStorageAppendQueueEnqueueErrorCode,
    LocalLogStorageAppendResolution,
};

/// Recoverable rejection of logical enqueue behind a resolving append head.
///
/// The failure owns the complete unchanged resolver, including its source and
/// optional resolver-request correlation. The attempted
/// [`crate::local_log::LocalLogEntry`] was borrowed and remains caller-owned.
/// Diagnostics omit the owner and all exact frame and selection payloads.
#[must_use = "a rejected enqueue retains its complete append resolver"]
pub struct LocalLogStorageAppendResolutionEnqueueFailure {
    owner: Box<LocalLogStorageAppendResolution>,
    error: LocalLogStorageAppendQueueEnqueueError,
}

impl LocalLogStorageAppendResolutionEnqueueFailure {
    pub(super) fn new(
        owner: LocalLogStorageAppendResolution,
        error: LocalLogStorageAppendQueueEnqueueError,
    ) -> Self {
        Self { owner: Box::new(owner), error }
    }

    /// Returns the complete unchanged append-resolution owner.
    pub const fn owner(&self) -> &LocalLogStorageAppendResolution {
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

    /// Recovers the complete unchanged append-resolution owner.
    #[must_use = "the returned resolver retains the unresolved head and queue"]
    pub fn into_owner(self) -> LocalLogStorageAppendResolution {
        *self.owner
    }

    /// Separates the unchanged resolver and typed enqueue error.
    #[must_use = "the returned resolver retains the unresolved head and queue"]
    pub fn into_parts(
        self,
    ) -> (LocalLogStorageAppendResolution, LocalLogStorageAppendQueueEnqueueError) {
        (*self.owner, self.error)
    }
}

impl fmt::Debug for LocalLogStorageAppendResolutionEnqueueFailure {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("LocalLogStorageAppendResolutionEnqueueFailure")
            .field("error", &self.error)
            .finish_non_exhaustive()
    }
}

impl fmt::Display for LocalLogStorageAppendResolutionEnqueueFailure {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.error.fmt(formatter)
    }
}

impl Error for LocalLogStorageAppendResolutionEnqueueFailure {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        Some(&self.error)
    }
}

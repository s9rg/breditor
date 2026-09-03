use std::{error::Error, fmt};

use super::{
    LocalLogStorageAppendQueue, LocalLogStorageAppendQueueEnqueueError,
    LocalLogStorageAppendQueueEnqueueErrorCode,
};

/// Recoverable rejection of one consuming append-queue enqueue action.
///
/// The failure owns the complete unchanged queue. The attempted
/// [`crate::local_log::LocalLogEntry`] was borrowed and remains caller-owned.
/// Diagnostics omit the queue and therefore cannot expose its exact frames or
/// speculative document state through this wrapper.
#[must_use = "a rejected enqueue retains its complete unchanged append queue"]
pub struct LocalLogStorageAppendQueueEnqueueFailure {
    queue: Box<LocalLogStorageAppendQueue>,
    error: LocalLogStorageAppendQueueEnqueueError,
}

impl LocalLogStorageAppendQueueEnqueueFailure {
    pub(super) fn new(
        queue: LocalLogStorageAppendQueue,
        error: LocalLogStorageAppendQueueEnqueueError,
    ) -> Self {
        Self { queue: Box::new(queue), error }
    }

    /// Returns the complete unchanged append queue.
    pub const fn queue(&self) -> &LocalLogStorageAppendQueue {
        &self.queue
    }

    /// Returns the typed enqueue error.
    #[must_use]
    pub const fn error(&self) -> &LocalLogStorageAppendQueueEnqueueError {
        &self.error
    }

    /// Returns the stable machine-readable failure category.
    #[must_use]
    pub const fn code(&self) -> LocalLogStorageAppendQueueEnqueueErrorCode {
        self.error.code()
    }

    /// Recovers the complete unchanged append queue.
    #[must_use = "the returned queue retains revocable authority and speculative state"]
    pub fn into_queue(self) -> LocalLogStorageAppendQueue {
        *self.queue
    }

    /// Separates the unchanged queue and typed enqueue error.
    #[must_use = "the returned queue retains revocable authority and speculative state"]
    pub fn into_parts(
        self,
    ) -> (LocalLogStorageAppendQueue, LocalLogStorageAppendQueueEnqueueError) {
        (*self.queue, self.error)
    }
}

impl fmt::Debug for LocalLogStorageAppendQueueEnqueueFailure {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("LocalLogStorageAppendQueueEnqueueFailure")
            .field("error", &self.error)
            .finish_non_exhaustive()
    }
}

impl fmt::Display for LocalLogStorageAppendQueueEnqueueFailure {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.error.fmt(formatter)
    }
}

impl Error for LocalLogStorageAppendQueueEnqueueFailure {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        Some(&self.error)
    }
}

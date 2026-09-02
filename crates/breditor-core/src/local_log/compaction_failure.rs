use std::{error::Error, fmt};

use super::{LocalLogCompactionError, LocalLogCompactionErrorCode};

/// Recoverable failure of one consuming local-log compaction transition.
///
/// The wrapper returns the complete unchanged log owner alongside a typed,
/// payload-free error. Its `Debug` and `Display` implementations deliberately
/// omit the owner so logging a policy or topology failure cannot expose the
/// document, session history, or retained events.
pub struct LocalLogCompactionFailure<T> {
    owner: Box<T>,
    error: LocalLogCompactionError,
}

impl<T> LocalLogCompactionFailure<T> {
    pub(super) fn new(owner: T, error: LocalLogCompactionError) -> Self {
        Self { owner: Box::new(owner), error }
    }

    /// Returns the typed compaction error without exposing the owner.
    #[must_use]
    pub const fn error(&self) -> &LocalLogCompactionError {
        &self.error
    }

    /// Returns the stable machine-readable error category.
    #[must_use]
    pub const fn code(&self) -> LocalLogCompactionErrorCode {
        self.error.code()
    }

    /// Returns the unchanged log owner retained by this failure.
    #[must_use]
    pub const fn owner(&self) -> &T {
        &self.owner
    }

    /// Recovers the unchanged log owner and discards the error.
    #[must_use]
    pub fn into_owner(self) -> T {
        *self.owner
    }

    /// Separates the unchanged log owner from its typed error.
    #[must_use]
    pub fn into_parts(self) -> (T, LocalLogCompactionError) {
        (*self.owner, self.error)
    }

    /// Rewraps the same compaction error around a crate-internal owner composition.
    #[must_use]
    pub(crate) fn map_owner<U>(self, map: impl FnOnce(T) -> U) -> LocalLogCompactionFailure<U> {
        let (owner, error) = self.into_parts();
        LocalLogCompactionFailure::new(map(owner), error)
    }
}

impl<T> fmt::Debug for LocalLogCompactionFailure<T> {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("LocalLogCompactionFailure")
            .field("error", &self.error)
            .finish_non_exhaustive()
    }
}

impl<T> fmt::Display for LocalLogCompactionFailure<T> {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.error.fmt(formatter)
    }
}

impl<T> Error for LocalLogCompactionFailure<T> {}

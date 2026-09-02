use std::{error::Error, fmt};

use super::{LocalLogStorageRootResolutionStartError, LocalLogStorageRootResolutionStartErrorCode};

/// Recoverable rejection of one consuming root-resolution start transition.
///
/// The wrapper retains the complete unchanged source owner. `Debug` and
/// `Display` deliberately omit that owner so diagnostics cannot expose its
/// exact plan payload.
///
/// ```compile_fail
/// fn require_clone<T: Clone>() {}
/// require_clone::<
///     breditor_core::codec::LocalLogStorageRootResolutionStartFailure<
///         breditor_core::codec::LocalLogStorageUncertainAttempt,
///     >,
/// >();
/// ```
#[must_use = "a rejected root-resolution start retains its unchanged owner"]
pub struct LocalLogStorageRootResolutionStartFailure<T> {
    retained: Box<T>,
    error: LocalLogStorageRootResolutionStartError,
}

impl<T> LocalLogStorageRootResolutionStartFailure<T> {
    pub(super) fn new(owner: T, error: LocalLogStorageRootResolutionStartError) -> Self {
        Self { retained: Box::new(owner), error }
    }

    /// Returns the complete unchanged source owner.
    #[must_use]
    pub const fn owner(&self) -> &T {
        &self.retained
    }

    /// Returns the typed start error.
    #[must_use]
    pub const fn error(&self) -> &LocalLogStorageRootResolutionStartError {
        &self.error
    }

    /// Returns the stable machine-readable failure category.
    #[must_use]
    pub const fn code(&self) -> LocalLogStorageRootResolutionStartErrorCode {
        self.error.code()
    }

    /// Recovers the complete unchanged source owner.
    #[must_use]
    pub fn into_owner(self) -> T {
        *self.retained
    }

    /// Separates the unchanged owner and typed start error.
    #[must_use = "the returned parts contain the unchanged source owner"]
    pub fn into_parts(self) -> (T, LocalLogStorageRootResolutionStartError) {
        (*self.retained, self.error)
    }
}

impl<T> fmt::Debug for LocalLogStorageRootResolutionStartFailure<T> {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("LocalLogStorageRootResolutionStartFailure")
            .field("error", &self.error)
            .finish_non_exhaustive()
    }
}

impl<T> fmt::Display for LocalLogStorageRootResolutionStartFailure<T> {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.error.fmt(formatter)
    }
}

impl<T> Error for LocalLogStorageRootResolutionStartFailure<T> {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        Some(&self.error)
    }
}

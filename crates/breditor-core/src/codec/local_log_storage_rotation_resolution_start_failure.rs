use std::{error::Error, fmt};

use super::{
    LocalLogStorageRotationResolutionStartError, LocalLogStorageRotationResolutionStartErrorCode,
};

/// Recoverable rejection of one consuming rotation-resolution start.
///
/// The wrapper retains the complete unchanged source owner. Diagnostics omit
/// that owner so its exact plan payload is never printed.
///
/// ```compile_fail
/// fn require_clone<T: Clone>() {}
/// require_clone::<
///     breditor_core::codec::LocalLogStorageRotationResolutionStartFailure<
///         breditor_core::codec::LocalLogStorageUncertainAttempt,
///     >,
/// >();
/// ```
#[must_use = "a rejected rotation-resolution start retains its unchanged owner"]
pub struct LocalLogStorageRotationResolutionStartFailure<T> {
    retained: Box<T>,
    error: LocalLogStorageRotationResolutionStartError,
}

impl<T> LocalLogStorageRotationResolutionStartFailure<T> {
    pub(super) fn new(owner: T, error: LocalLogStorageRotationResolutionStartError) -> Self {
        Self { retained: Box::new(owner), error }
    }

    /// Returns the complete unchanged source owner.
    #[must_use]
    pub const fn owner(&self) -> &T {
        &self.retained
    }

    /// Returns the typed start error.
    #[must_use]
    pub const fn error(&self) -> &LocalLogStorageRotationResolutionStartError {
        &self.error
    }

    /// Returns the stable machine-readable failure category.
    #[must_use]
    pub const fn code(&self) -> LocalLogStorageRotationResolutionStartErrorCode {
        self.error.code()
    }

    /// Recovers the complete unchanged source owner.
    #[must_use]
    pub fn into_owner(self) -> T {
        *self.retained
    }

    /// Separates the unchanged owner and typed start error.
    #[must_use = "the returned parts contain the unchanged source owner"]
    pub fn into_parts(self) -> (T, LocalLogStorageRotationResolutionStartError) {
        (*self.retained, self.error)
    }
}

impl<T> fmt::Debug for LocalLogStorageRotationResolutionStartFailure<T> {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("LocalLogStorageRotationResolutionStartFailure")
            .field("error", &self.error)
            .finish_non_exhaustive()
    }
}

impl<T> fmt::Display for LocalLogStorageRotationResolutionStartFailure<T> {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.error.fmt(formatter)
    }
}

impl<T> Error for LocalLogStorageRotationResolutionStartFailure<T> {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        Some(&self.error)
    }
}

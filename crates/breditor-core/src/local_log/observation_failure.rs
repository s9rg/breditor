use std::{error::Error, fmt};

use super::{LocalLogEntry, LocalLogRecoveryError, LocalLogRecoveryErrorCode};

/// Recoverable rejection of one consuming incremental log observation.
///
/// The wrapper returns both the complete unchanged owner and exact rejected
/// entry. Its `Debug` and `Display` implementations deliberately omit those
/// values so logging a failure cannot expose the session, event, commit,
/// operation guards, or document payload.
pub struct LocalLogObservationFailure<T> {
    rejected: Box<(T, LocalLogEntry)>,
    error: LocalLogRecoveryError,
}

impl<T> LocalLogObservationFailure<T> {
    pub(super) fn new(
        owner: T,
        rejected_entry: LocalLogEntry,
        error: LocalLogRecoveryError,
    ) -> Self {
        Self { rejected: Box::new((owner, rejected_entry)), error }
    }

    /// Returns the unchanged owner without exposing it through diagnostics.
    #[must_use]
    pub const fn owner(&self) -> &T {
        &self.rejected.0
    }

    /// Returns the exact rejected entry without exposing it through diagnostics.
    #[must_use]
    pub const fn rejected_entry(&self) -> &LocalLogEntry {
        &self.rejected.1
    }

    /// Returns the typed rejection reason.
    #[must_use]
    pub const fn error(&self) -> &LocalLogRecoveryError {
        &self.error
    }

    /// Returns the stable machine-readable rejection category.
    #[must_use]
    pub const fn code(&self) -> LocalLogRecoveryErrorCode {
        self.error.code()
    }

    /// Separates the unchanged owner, rejected entry, and typed error.
    #[must_use]
    pub fn into_parts(self) -> (T, LocalLogEntry, LocalLogRecoveryError) {
        let (owner, rejected_entry) = *self.rejected;
        (owner, rejected_entry, self.error)
    }

    /// Returns only the typed error, deliberately dropping the owner and entry.
    ///
    /// Complete-batch compatibility uses this when its historical contract
    /// intentionally publishes no partial owner after a late rejection.
    #[must_use]
    pub fn into_error(self) -> LocalLogRecoveryError {
        self.error
    }
}

impl<T> fmt::Debug for LocalLogObservationFailure<T> {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("LocalLogObservationFailure")
            .field("error", &self.error)
            .finish_non_exhaustive()
    }
}

impl<T> fmt::Display for LocalLogObservationFailure<T> {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.error.fmt(formatter)
    }
}

impl<T> Error for LocalLogObservationFailure<T> {}

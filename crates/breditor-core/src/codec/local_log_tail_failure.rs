use std::{error::Error, fmt};

use crate::local_log::LocalLogEntry;

use super::{LocalLogTailCursor, LocalLogTailError, LocalLogTailErrorCode};

/// Recoverable failure of one consuming active-tail frame observation.
///
/// The failure returns the complete unchanged cursor. Admission failures also
/// retain the exact decoded entry for inspection or comparison. Retrying the
/// cursor still requires the unchanged caller-owned frame bytes; submitting the
/// entry directly would dissolve physical-offset coupling. `Debug` and
/// `Display` deliberately omit the retained cursor and entry. Nested typed
/// errors may still contain bounded identifiers or rejected field values, so
/// these diagnostics are not a general secret-redaction boundary.
pub struct LocalLogTailFailure {
    retained: Box<(LocalLogTailCursor, Option<LocalLogEntry>)>,
    error: LocalLogTailError,
}

impl LocalLogTailFailure {
    pub(super) fn new(
        cursor: LocalLogTailCursor,
        rejected_entry: Option<LocalLogEntry>,
        error: LocalLogTailError,
    ) -> Self {
        Self { retained: Box::new((cursor, rejected_entry)), error }
    }

    /// Returns the unchanged active-tail cursor.
    #[must_use]
    pub const fn cursor(&self) -> &LocalLogTailCursor {
        &self.retained.0
    }

    /// Returns the decoded entry retained only after admission rejection.
    #[must_use]
    pub const fn rejected_entry(&self) -> Option<&LocalLogEntry> {
        self.retained.1.as_ref()
    }

    /// Returns the typed transition error.
    #[must_use]
    pub const fn error(&self) -> &LocalLogTailError {
        &self.error
    }

    /// Returns the stable machine-readable failure category.
    #[must_use]
    pub const fn code(&self) -> LocalLogTailErrorCode {
        self.error.code()
    }

    /// Separates the unchanged cursor, optional rejected entry, and error.
    #[must_use]
    pub fn into_parts(self) -> (LocalLogTailCursor, Option<LocalLogEntry>, LocalLogTailError) {
        let (cursor, rejected_entry) = *self.retained;
        (cursor, rejected_entry, self.error)
    }
}

impl fmt::Debug for LocalLogTailFailure {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("LocalLogTailFailure")
            .field("error", &self.error)
            .finish_non_exhaustive()
    }
}

impl fmt::Display for LocalLogTailFailure {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.error.fmt(formatter)
    }
}

impl Error for LocalLogTailFailure {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        Some(&self.error)
    }
}

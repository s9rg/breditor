use std::{error::Error, fmt};

use crate::local_log::LocalLogEntry;

use super::{LocalLogTailCursorV3, LocalLogTailErrorCode, LocalLogTailErrorV3};

/// Recoverable failure of one consuming Frame V3 tail observation.
///
/// The failure owns the complete unchanged V3 cursor, including its schema
/// binding and frame policy. Admission failures additionally retain the exact
/// decoded Entry V3. Diagnostics omit both retained values.
pub struct LocalLogTailFailureV3 {
    retained: Box<(LocalLogTailCursorV3, Option<LocalLogEntry>)>,
    error: LocalLogTailErrorV3,
}

impl LocalLogTailFailureV3 {
    pub(super) fn new(
        cursor: LocalLogTailCursorV3,
        rejected_entry: Option<LocalLogEntry>,
        error: LocalLogTailErrorV3,
    ) -> Self {
        Self { retained: Box::new((cursor, rejected_entry)), error }
    }

    /// Returns the unchanged Frame V3 tail cursor.
    #[must_use]
    pub const fn cursor(&self) -> &LocalLogTailCursorV3 {
        &self.retained.0
    }

    /// Returns the decoded entry retained only after admission rejection.
    #[must_use]
    pub const fn rejected_entry(&self) -> Option<&LocalLogEntry> {
        self.retained.1.as_ref()
    }

    /// Returns the typed V3 transition error.
    #[must_use]
    pub const fn error(&self) -> &LocalLogTailErrorV3 {
        &self.error
    }

    /// Returns the stable machine-readable tail failure category.
    #[must_use]
    pub const fn code(&self) -> LocalLogTailErrorCode {
        self.error.code()
    }

    /// Separates the unchanged cursor, optional entry, and typed error.
    #[must_use]
    pub fn into_parts(self) -> (LocalLogTailCursorV3, Option<LocalLogEntry>, LocalLogTailErrorV3) {
        let (cursor, rejected_entry) = *self.retained;
        (cursor, rejected_entry, self.error)
    }
}

impl fmt::Debug for LocalLogTailFailureV3 {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("LocalLogTailFailureV3")
            .field("error", &self.error)
            .finish_non_exhaustive()
    }
}

impl fmt::Display for LocalLogTailFailureV3 {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.error.fmt(formatter)
    }
}

impl Error for LocalLogTailFailureV3 {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        Some(&self.error)
    }
}

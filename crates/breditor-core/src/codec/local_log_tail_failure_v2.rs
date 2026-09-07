use std::{error::Error, fmt};

use crate::local_log::LocalLogEntry;

use super::{LocalLogTailCursorV2, LocalLogTailErrorCode, LocalLogTailErrorV2};

/// Recoverable failure of one consuming Frame V2 tail observation.
///
/// The failure owns the complete unchanged V2 cursor, including its schema
/// binding and frame policy. Admission failures additionally retain the exact
/// decoded Entry V2. Diagnostics omit both retained values.
pub struct LocalLogTailFailureV2 {
    retained: Box<(LocalLogTailCursorV2, Option<LocalLogEntry>)>,
    error: LocalLogTailErrorV2,
}

impl LocalLogTailFailureV2 {
    pub(super) fn new(
        cursor: LocalLogTailCursorV2,
        rejected_entry: Option<LocalLogEntry>,
        error: LocalLogTailErrorV2,
    ) -> Self {
        Self { retained: Box::new((cursor, rejected_entry)), error }
    }

    /// Returns the unchanged Frame V2 tail cursor.
    #[must_use]
    pub const fn cursor(&self) -> &LocalLogTailCursorV2 {
        &self.retained.0
    }

    /// Returns the decoded entry retained only after admission rejection.
    #[must_use]
    pub const fn rejected_entry(&self) -> Option<&LocalLogEntry> {
        self.retained.1.as_ref()
    }

    /// Returns the typed V2 transition error.
    #[must_use]
    pub const fn error(&self) -> &LocalLogTailErrorV2 {
        &self.error
    }

    /// Returns the stable machine-readable tail failure category.
    #[must_use]
    pub const fn code(&self) -> LocalLogTailErrorCode {
        self.error.code()
    }

    /// Separates the unchanged cursor, optional entry, and typed error.
    #[must_use]
    pub fn into_parts(self) -> (LocalLogTailCursorV2, Option<LocalLogEntry>, LocalLogTailErrorV2) {
        let (cursor, rejected_entry) = *self.retained;
        (cursor, rejected_entry, self.error)
    }
}

impl fmt::Debug for LocalLogTailFailureV2 {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("LocalLogTailFailureV2")
            .field("error", &self.error)
            .finish_non_exhaustive()
    }
}

impl fmt::Display for LocalLogTailFailureV2 {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.error.fmt(formatter)
    }
}

impl Error for LocalLogTailFailureV2 {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        Some(&self.error)
    }
}

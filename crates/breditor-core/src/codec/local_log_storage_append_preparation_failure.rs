use std::{error::Error, fmt};

use super::{
    LocalLogStorageAppendPreparationError, LocalLogStorageAppendPreparationErrorCode,
    LocalLogStorageMutationToken, LocalLogTailCursor,
};

/// Recoverable rejection of one consuming storage-append preparation.
///
/// The failure owns the complete unchanged mutation token and tail cursor. The
/// attempted [`crate::local_log::LocalLogEntry`] was only borrowed and remains
/// caller-owned. Diagnostics omit both retained inputs and therefore do not
/// expose the cursor's speculative document state or the token's selection
/// envelope through this wrapper.
#[must_use = "a rejected append preparation retains its unchanged authority and cursor"]
pub struct LocalLogStorageAppendPreparationFailure {
    retained: Box<(LocalLogStorageMutationToken, LocalLogTailCursor)>,
    error: LocalLogStorageAppendPreparationError,
}

impl LocalLogStorageAppendPreparationFailure {
    pub(super) fn new(
        token: LocalLogStorageMutationToken,
        cursor: LocalLogTailCursor,
        error: LocalLogStorageAppendPreparationError,
    ) -> Self {
        Self { retained: Box::new((token, cursor)), error }
    }

    /// Returns the unchanged storage mutation token.
    pub const fn token(&self) -> &LocalLogStorageMutationToken {
        &self.retained.0
    }

    /// Returns the unchanged active-tail cursor.
    #[must_use]
    pub const fn cursor(&self) -> &LocalLogTailCursor {
        &self.retained.1
    }

    /// Returns the typed preparation error.
    #[must_use]
    pub const fn error(&self) -> &LocalLogStorageAppendPreparationError {
        &self.error
    }

    /// Returns the stable machine-readable failure category.
    #[must_use]
    pub const fn code(&self) -> LocalLogStorageAppendPreparationErrorCode {
        self.error.code()
    }

    /// Recovers the complete unchanged token and cursor.
    #[must_use = "the returned values contain the unchanged append preparation inputs"]
    pub fn into_inputs(self) -> (LocalLogStorageMutationToken, LocalLogTailCursor) {
        *self.retained
    }

    /// Separates both unchanged inputs and the typed preparation error.
    #[must_use = "the returned parts contain the unchanged append preparation inputs"]
    pub fn into_parts(
        self,
    ) -> (LocalLogStorageMutationToken, LocalLogTailCursor, LocalLogStorageAppendPreparationError)
    {
        let (token, cursor) = *self.retained;
        (token, cursor, self.error)
    }
}

impl fmt::Debug for LocalLogStorageAppendPreparationFailure {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("LocalLogStorageAppendPreparationFailure")
            .field("error", &self.error)
            .finish_non_exhaustive()
    }
}

impl fmt::Display for LocalLogStorageAppendPreparationFailure {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.error.fmt(formatter)
    }
}

impl Error for LocalLogStorageAppendPreparationFailure {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        Some(&self.error)
    }
}

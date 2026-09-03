use std::{error::Error, fmt};

use super::{
    LocalLogStorageAppendTerminalAttestation, LocalLogStorageAppendTransitionError,
    LocalLogStorageAppendTransitionErrorCode,
};

/// Recoverable rejection of one consuming append terminal attestation.
///
/// Both the complete unchanged owner and the unapplied attestation are
/// retained. Diagnostics deliberately omit them so retained document bytes and
/// misleading evidence-like values cannot leak through error formatting.
pub struct LocalLogStorageAppendTerminalFailure<T> {
    retained: Box<(T, LocalLogStorageAppendTerminalAttestation)>,
    error: LocalLogStorageAppendTransitionError,
}

impl<T> LocalLogStorageAppendTerminalFailure<T> {
    pub(super) fn new(
        owner: T,
        attestation: LocalLogStorageAppendTerminalAttestation,
        error: LocalLogStorageAppendTransitionError,
    ) -> Self {
        Self { retained: Box::new((owner, attestation)), error }
    }

    /// Returns the complete unchanged typestate owner.
    #[must_use]
    pub const fn owner(&self) -> &T {
        &self.retained.0
    }

    /// Returns the exact unapplied host attestation.
    #[must_use = "the unapplied append attestation remains available for inspection"]
    pub const fn attestation(&self) -> &LocalLogStorageAppendTerminalAttestation {
        &self.retained.1
    }

    /// Returns the typed transition error.
    #[must_use]
    pub const fn error(&self) -> &LocalLogStorageAppendTransitionError {
        &self.error
    }

    /// Returns the stable machine-readable failure category.
    #[must_use]
    pub const fn code(&self) -> LocalLogStorageAppendTransitionErrorCode {
        self.error.code()
    }

    /// Recovers the unchanged owner and discards the rejected attestation.
    #[must_use]
    pub fn into_owner(self) -> T {
        self.retained.0
    }

    /// Separates the owner, unapplied attestation, and typed error.
    #[must_use = "the returned parts retain the owner and unapplied attestation"]
    pub fn into_parts(
        self,
    ) -> (T, LocalLogStorageAppendTerminalAttestation, LocalLogStorageAppendTransitionError) {
        let (owner, attestation) = *self.retained;
        (owner, attestation, self.error)
    }
}

impl<T> fmt::Debug for LocalLogStorageAppendTerminalFailure<T> {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("LocalLogStorageAppendTerminalFailure")
            .field("error", &self.error)
            .finish_non_exhaustive()
    }
}

impl<T> fmt::Display for LocalLogStorageAppendTerminalFailure<T> {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.error.fmt(formatter)
    }
}

impl<T> Error for LocalLogStorageAppendTerminalFailure<T> {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        Some(&self.error)
    }
}

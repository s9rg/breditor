use std::{error::Error, fmt};

use super::{
    LocalLogStorageAttemptTerminalAttestation, LocalLogStorageAttemptTransitionError,
    LocalLogStorageAttemptTransitionErrorCode,
};

/// Recoverable rejection of one consuming terminal-attempt attestation.
///
/// The wrapper returns both the complete unchanged typestate owner and the
/// unapplied host attestation. `Debug` and `Display` deliberately omit both so
/// diagnostics cannot expose retained plan payloads or make an observation
/// look accepted when it was rejected.
///
/// ```compile_fail
/// fn require_clone<T: Clone>() {}
/// require_clone::<
///     breditor_core::codec::LocalLogStorageAttemptTerminalFailure<
///         breditor_core::codec::LocalLogStorageUncertainAttempt,
///     >,
/// >();
/// ```
pub struct LocalLogStorageAttemptTerminalFailure<T> {
    retained: Box<(T, LocalLogStorageAttemptTerminalAttestation)>,
    error: LocalLogStorageAttemptTransitionError,
}

impl<T> LocalLogStorageAttemptTerminalFailure<T> {
    pub(super) fn new(
        owner: T,
        attestation: LocalLogStorageAttemptTerminalAttestation,
        error: LocalLogStorageAttemptTransitionError,
    ) -> Self {
        Self { retained: Box::new((owner, attestation)), error }
    }

    /// Returns the complete unchanged typestate owner.
    #[must_use]
    pub const fn owner(&self) -> &T {
        &self.retained.0
    }

    /// Returns the exact unapplied host attestation.
    #[must_use = "the unapplied terminal attestation remains available for inspection"]
    pub const fn attestation(&self) -> &LocalLogStorageAttemptTerminalAttestation {
        &self.retained.1
    }

    /// Returns the typed transition error.
    #[must_use]
    pub const fn error(&self) -> &LocalLogStorageAttemptTransitionError {
        &self.error
    }

    /// Returns the stable machine-readable failure category.
    #[must_use]
    pub const fn code(&self) -> LocalLogStorageAttemptTransitionErrorCode {
        self.error.code()
    }

    /// Recovers the unchanged owner and discards the rejected attestation.
    #[must_use]
    pub fn into_owner(self) -> T {
        self.retained.0
    }

    /// Separates the owner, unapplied attestation, and typed error.
    #[must_use = "the returned parts contain the unchanged owner and unapplied attestation"]
    pub fn into_parts(
        self,
    ) -> (T, LocalLogStorageAttemptTerminalAttestation, LocalLogStorageAttemptTransitionError) {
        let (owner, attestation) = *self.retained;
        (owner, attestation, self.error)
    }
}

impl<T> fmt::Debug for LocalLogStorageAttemptTerminalFailure<T> {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("LocalLogStorageAttemptTerminalFailure")
            .field("error", &self.error)
            .finish_non_exhaustive()
    }
}

impl<T> fmt::Display for LocalLogStorageAttemptTerminalFailure<T> {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.error.fmt(formatter)
    }
}

impl<T> Error for LocalLogStorageAttemptTerminalFailure<T> {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        Some(&self.error)
    }
}

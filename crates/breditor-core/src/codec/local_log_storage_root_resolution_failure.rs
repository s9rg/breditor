use std::{error::Error, fmt};

use super::{
    LocalLogStorageRootResolution, LocalLogStorageRootResolutionEvidence,
    LocalLogStorageRootResolutionTransitionError, LocalLogStorageRootResolutionTransitionErrorCode,
};

/// Ownership-preserving rejection of unapplied root-resolution evidence.
///
/// The exact resolution owner and evidence are returned unchanged so the caller
/// can route stale/cross-request evidence correctly or restart the read-only
/// resolution. No finding is semantically classified on this path.
#[must_use = "rejected root-resolution evidence retains both owner and evidence"]
pub struct LocalLogStorageRootResolutionFailure {
    retained: Box<(LocalLogStorageRootResolution, LocalLogStorageRootResolutionEvidence)>,
    error: LocalLogStorageRootResolutionTransitionError,
}

impl LocalLogStorageRootResolutionFailure {
    pub(super) fn new(
        resolution: LocalLogStorageRootResolution,
        evidence: LocalLogStorageRootResolutionEvidence,
        error: LocalLogStorageRootResolutionTransitionError,
    ) -> Self {
        Self { retained: Box::new((resolution, evidence)), error }
    }

    /// Returns the correlation/typestate failure.
    #[must_use]
    pub const fn error(&self) -> &LocalLogStorageRootResolutionTransitionError {
        &self.error
    }

    /// Returns the unchanged unresolved owner.
    pub const fn resolution(&self) -> &LocalLogStorageRootResolution {
        &self.retained.0
    }

    /// Returns the unapplied terminal evidence.
    pub const fn evidence(&self) -> &LocalLogStorageRootResolutionEvidence {
        &self.retained.1
    }

    /// Returns the stable machine-readable failure category.
    #[must_use]
    pub const fn code(&self) -> LocalLogStorageRootResolutionTransitionErrorCode {
        self.error.code()
    }

    /// Recovers the unchanged resolver and discards the rejected evidence.
    #[must_use = "the unchanged resolver remains unresolved"]
    pub fn into_resolution(self) -> LocalLogStorageRootResolution {
        self.retained.0
    }

    /// Recovers the unchanged owner, unapplied evidence, and error.
    #[must_use = "the returned parts contain the unchanged resolver and unapplied evidence"]
    pub fn into_parts(
        self,
    ) -> (
        LocalLogStorageRootResolution,
        LocalLogStorageRootResolutionEvidence,
        LocalLogStorageRootResolutionTransitionError,
    ) {
        let (resolution, evidence) = *self.retained;
        (resolution, evidence, self.error)
    }
}

impl fmt::Debug for LocalLogStorageRootResolutionFailure {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("LocalLogStorageRootResolutionFailure")
            .field("error", &self.error)
            .finish_non_exhaustive()
    }
}

impl fmt::Display for LocalLogStorageRootResolutionFailure {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.error.fmt(formatter)
    }
}

impl Error for LocalLogStorageRootResolutionFailure {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        Some(&self.error)
    }
}

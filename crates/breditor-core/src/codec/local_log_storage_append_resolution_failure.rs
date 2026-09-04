use std::{error::Error, fmt};

use super::{
    LocalLogStorageAppendResolution, LocalLogStorageAppendResolutionEvidence,
    LocalLogStorageAppendResolutionTransitionError,
    LocalLogStorageAppendResolutionTransitionErrorCode,
};

/// Ownership-preserving rejection of unapplied append-resolution evidence.
///
/// The complete resolver and evidence are returned unchanged. No observation
/// is classified and no queue head, allocation, cursor, or correlation is
/// removed on this path.
#[must_use = "rejected append-resolution evidence retains both owner and evidence"]
pub struct LocalLogStorageAppendResolutionFailure {
    retained: Box<(LocalLogStorageAppendResolution, LocalLogStorageAppendResolutionEvidence)>,
    error: LocalLogStorageAppendResolutionTransitionError,
}

impl LocalLogStorageAppendResolutionFailure {
    pub(super) fn new(
        resolution: LocalLogStorageAppendResolution,
        evidence: LocalLogStorageAppendResolutionEvidence,
        error: LocalLogStorageAppendResolutionTransitionError,
    ) -> Self {
        Self { retained: Box::new((resolution, evidence)), error }
    }

    /// Returns the correlation/typestate failure.
    #[must_use]
    pub const fn error(&self) -> &LocalLogStorageAppendResolutionTransitionError {
        &self.error
    }

    /// Returns the unchanged unresolved owner.
    pub const fn resolution(&self) -> &LocalLogStorageAppendResolution {
        &self.retained.0
    }

    /// Returns the unapplied terminal evidence.
    pub const fn evidence(&self) -> &LocalLogStorageAppendResolutionEvidence {
        &self.retained.1
    }

    /// Returns the stable machine-readable failure category.
    #[must_use]
    pub const fn code(&self) -> LocalLogStorageAppendResolutionTransitionErrorCode {
        self.error.code()
    }

    /// Recovers the unchanged resolver and discards the rejected evidence.
    #[must_use = "the unchanged resolver remains unresolved"]
    pub fn into_resolution(self) -> LocalLogStorageAppendResolution {
        self.retained.0
    }

    /// Recovers the unchanged resolver, evidence, and transition error.
    #[must_use = "the returned parts retain unresolved state and unapplied evidence"]
    pub fn into_parts(
        self,
    ) -> (
        LocalLogStorageAppendResolution,
        LocalLogStorageAppendResolutionEvidence,
        LocalLogStorageAppendResolutionTransitionError,
    ) {
        let (resolution, evidence) = *self.retained;
        (resolution, evidence, self.error)
    }
}

impl fmt::Debug for LocalLogStorageAppendResolutionFailure {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("LocalLogStorageAppendResolutionFailure")
            .field("error", &self.error)
            .finish_non_exhaustive()
    }
}

impl fmt::Display for LocalLogStorageAppendResolutionFailure {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.error.fmt(formatter)
    }
}

impl Error for LocalLogStorageAppendResolutionFailure {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        Some(&self.error)
    }
}

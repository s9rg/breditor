use std::{error::Error, fmt};

use super::{
    LocalLogStorageRotationResolution, LocalLogStorageRotationResolutionEvidence,
    LocalLogStorageRotationResolutionTransitionError,
    LocalLogStorageRotationResolutionTransitionErrorCode,
};

/// Ownership-preserving rejection of unapplied rotation-resolution evidence.
///
/// The exact resolution owner and evidence are returned unchanged. No physical
/// finding is semantically classified on this path.
#[must_use = "rejected rotation-resolution evidence retains both owner and evidence"]
pub struct LocalLogStorageRotationResolutionFailure {
    retained: Box<(LocalLogStorageRotationResolution, LocalLogStorageRotationResolutionEvidence)>,
    error: LocalLogStorageRotationResolutionTransitionError,
}

impl LocalLogStorageRotationResolutionFailure {
    pub(super) fn new(
        resolution: LocalLogStorageRotationResolution,
        evidence: LocalLogStorageRotationResolutionEvidence,
        error: LocalLogStorageRotationResolutionTransitionError,
    ) -> Self {
        Self { retained: Box::new((resolution, evidence)), error }
    }

    /// Returns the correlation/typestate failure.
    #[must_use]
    pub const fn error(&self) -> &LocalLogStorageRotationResolutionTransitionError {
        &self.error
    }

    /// Returns the unchanged unresolved owner.
    pub const fn resolution(&self) -> &LocalLogStorageRotationResolution {
        &self.retained.0
    }

    /// Returns the unapplied terminal evidence.
    pub const fn evidence(&self) -> &LocalLogStorageRotationResolutionEvidence {
        &self.retained.1
    }

    /// Returns the stable machine-readable failure category.
    #[must_use]
    pub const fn code(&self) -> LocalLogStorageRotationResolutionTransitionErrorCode {
        self.error.code()
    }

    /// Recovers the unchanged resolver and discards the rejected evidence.
    #[must_use = "the unchanged resolver remains unresolved"]
    pub fn into_resolution(self) -> LocalLogStorageRotationResolution {
        self.retained.0
    }

    /// Recovers the unchanged owner, unapplied evidence, and error.
    #[must_use = "the returned parts contain the unchanged resolver and unapplied evidence"]
    pub fn into_parts(
        self,
    ) -> (
        LocalLogStorageRotationResolution,
        LocalLogStorageRotationResolutionEvidence,
        LocalLogStorageRotationResolutionTransitionError,
    ) {
        let (resolution, evidence) = *self.retained;
        (resolution, evidence, self.error)
    }
}

impl fmt::Debug for LocalLogStorageRotationResolutionFailure {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("LocalLogStorageRotationResolutionFailure")
            .field("error", &self.error)
            .finish_non_exhaustive()
    }
}

impl fmt::Display for LocalLogStorageRotationResolutionFailure {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.error.fmt(formatter)
    }
}

impl Error for LocalLogStorageRotationResolutionFailure {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        Some(&self.error)
    }
}

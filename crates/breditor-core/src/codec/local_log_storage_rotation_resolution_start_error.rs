use thiserror::Error;

use super::LocalLogStorageSelectionKind;

/// Stable category for failure to begin a rotation storage resolution.
#[non_exhaustive]
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub enum LocalLogStorageRotationResolutionStartErrorCode {
    /// The exact retained plan is a root rather than a rotation.
    SelectionKindMismatch,
}

impl LocalLogStorageRotationResolutionStartErrorCode {
    /// Returns the stable namespaced error code.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::SelectionKindMismatch => {
                "local_log_storage_rotation_resolution_start.selection_kind_mismatch"
            }
        }
    }
}

/// Payload-free rejection of a rotation storage-resolution start transition.
#[non_exhaustive]
#[derive(Clone, Copy, Debug, Eq, Error, Hash, Ord, PartialEq, PartialOrd)]
pub enum LocalLogStorageRotationResolutionStartError {
    /// Rotation resolution cannot consume a root plan.
    #[error("rotation storage resolution requires a rotation candidate, got {actual}")]
    SelectionKindMismatch {
        /// Actual shape of the unchanged retained plan.
        actual: LocalLogStorageSelectionKind,
    },
}

impl LocalLogStorageRotationResolutionStartError {
    /// Returns the stable machine-readable failure category.
    #[must_use]
    pub const fn code(self) -> LocalLogStorageRotationResolutionStartErrorCode {
        match self {
            Self::SelectionKindMismatch { .. } => {
                LocalLogStorageRotationResolutionStartErrorCode::SelectionKindMismatch
            }
        }
    }

    /// Returns the actual candidate shape rejected by the rotation-only boundary.
    #[must_use]
    pub const fn actual(self) -> LocalLogStorageSelectionKind {
        match self {
            Self::SelectionKindMismatch { actual } => actual,
        }
    }
}

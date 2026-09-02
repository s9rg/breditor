use thiserror::Error;

use super::LocalLogStorageSelectionKind;

/// Stable category for failure to begin a root storage resolution.
#[non_exhaustive]
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub enum LocalLogStorageRootResolutionStartErrorCode {
    /// The exact retained plan is a rotation rather than a root.
    SelectionKindMismatch,
}

impl LocalLogStorageRootResolutionStartErrorCode {
    /// Returns the stable namespaced error code.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::SelectionKindMismatch => {
                "local_log_storage_root_resolution_start.selection_kind_mismatch"
            }
        }
    }
}

/// Payload-free rejection of a root storage-resolution start transition.
#[non_exhaustive]
#[derive(Clone, Copy, Debug, Eq, Error, Hash, Ord, PartialEq, PartialOrd)]
pub enum LocalLogStorageRootResolutionStartError {
    /// Root resolution cannot consume a rotation plan.
    #[error("root storage resolution requires a root candidate, got {actual}")]
    SelectionKindMismatch {
        /// Actual shape of the unchanged retained plan.
        actual: LocalLogStorageSelectionKind,
    },
}

impl LocalLogStorageRootResolutionStartError {
    /// Returns the stable machine-readable failure category.
    #[must_use]
    pub const fn code(self) -> LocalLogStorageRootResolutionStartErrorCode {
        match self {
            Self::SelectionKindMismatch { .. } => {
                LocalLogStorageRootResolutionStartErrorCode::SelectionKindMismatch
            }
        }
    }

    /// Returns the actual candidate shape rejected by the root-only boundary.
    #[must_use]
    pub const fn actual(self) -> LocalLogStorageSelectionKind {
        match self {
            Self::SelectionKindMismatch { actual } => actual,
        }
    }
}

#[cfg(test)]
mod tests {
    use std::error::Error as _;

    use super::{
        LocalLogStorageRootResolutionStartError, LocalLogStorageRootResolutionStartErrorCode,
    };
    use crate::codec::LocalLogStorageSelectionKind;

    #[test]
    fn selection_mismatch_contract_is_stable_and_payload_free() {
        let error = LocalLogStorageRootResolutionStartError::SelectionKindMismatch {
            actual: LocalLogStorageSelectionKind::Rotation,
        };

        assert_eq!(
            error.code(),
            LocalLogStorageRootResolutionStartErrorCode::SelectionKindMismatch
        );
        assert_eq!(error.actual(), LocalLogStorageSelectionKind::Rotation);
        assert_eq!(
            error.code().as_str(),
            "local_log_storage_root_resolution_start.selection_kind_mismatch"
        );
        assert!(error.source().is_none());
        assert!(!format!("{error:?}").contains("PAYLOADSENTINEL"));
        assert!(!error.to_string().contains("PAYLOADSENTINEL"));
    }
}

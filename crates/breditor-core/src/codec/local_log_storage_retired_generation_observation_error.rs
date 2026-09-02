use std::fmt;

use thiserror::Error;

use super::LocalLogStorageSelectedCheckpointGenerationState;

/// Immutable retired-generation fact that disagrees with its active snapshot.
#[non_exhaustive]
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub enum LocalLogStorageRetiredGenerationMismatchField {
    /// Generation identity.
    LogId,
    /// Session identity.
    SessionId,
    /// Frame policy.
    Frame,
    /// Immutable activation fence.
    ActivatedFenceId,
    /// Head that activated the generation.
    ActivatedByHeadId,
    /// Head that retired the generation.
    RetiredByHeadId,
}

impl LocalLogStorageRetiredGenerationMismatchField {
    /// Returns the stable logical fact spelling.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::LogId => "logId",
            Self::SessionId => "sessionId",
            Self::Frame => "frame",
            Self::ActivatedFenceId => "activatedFenceId",
            Self::ActivatedByHeadId => "activatedByHeadId",
            Self::RetiredByHeadId => "retiredByHeadId",
        }
    }
}

impl fmt::Display for LocalLogStorageRetiredGenerationMismatchField {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(self.as_str())
    }
}

/// Stable machine-readable category for retired-generation validation failure.
#[non_exhaustive]
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub enum LocalLogStorageRetiredGenerationObservationErrorCode {
    /// The later record is not retired or reclaimed.
    InvalidState,
    /// The retiring head equals the head that activated the generation.
    HeadNotAdvanced,
    /// An immutable tombstone fact differs.
    FieldMismatch,
}

impl LocalLogStorageRetiredGenerationObservationErrorCode {
    /// Returns the stable namespaced error code.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::InvalidState => "local_log_storage_retired_generation_observation.invalid_state",
            Self::HeadNotAdvanced => {
                "local_log_storage_retired_generation_observation.head_not_advanced"
            }
            Self::FieldMismatch => {
                "local_log_storage_retired_generation_observation.field_mismatch"
            }
        }
    }
}

/// Why a later checkpoint record is not the exact retirement of an active one.
///
/// The error retains only fixed enums. It owns no binding or application data
/// and does not itself prove that either input came from storage.
#[non_exhaustive]
#[derive(Clone, Copy, Debug, Eq, Error, Hash, Ord, PartialEq, PartialOrd)]
pub enum LocalLogStorageRetiredGenerationObservationError {
    /// A formerly active generation must later be retired or reclaimed.
    #[error("a later former-active generation has invalid state {observed}")]
    InvalidState {
        /// State supplied by the later checkpoint record.
        observed: LocalLogStorageSelectedCheckpointGenerationState,
    },
    /// Retirement must be performed by a distinct superseding head.
    #[error("a later retired generation must advance to a distinct retiring head")]
    HeadNotAdvanced,
    /// One immutable active/retirement fact changed.
    #[error("a later retired generation disagrees at {field}")]
    FieldMismatch {
        /// First mismatching fact in deterministic comparison order.
        field: LocalLogStorageRetiredGenerationMismatchField,
    },
}

impl LocalLogStorageRetiredGenerationObservationError {
    /// Returns the stable machine-readable failure category.
    #[must_use]
    pub const fn code(&self) -> LocalLogStorageRetiredGenerationObservationErrorCode {
        match self {
            Self::InvalidState { .. } => {
                LocalLogStorageRetiredGenerationObservationErrorCode::InvalidState
            }
            Self::HeadNotAdvanced => {
                LocalLogStorageRetiredGenerationObservationErrorCode::HeadNotAdvanced
            }
            Self::FieldMismatch { .. } => {
                LocalLogStorageRetiredGenerationObservationErrorCode::FieldMismatch
            }
        }
    }
}

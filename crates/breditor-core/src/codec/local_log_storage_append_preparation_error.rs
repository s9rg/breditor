use thiserror::Error;

use super::{
    LocalLogFrameCodecError, LocalLogFrameErrorCode, LocalLogTailError, LocalLogTailErrorCode,
};

/// Stable category for one storage-append plan preparation failure.
#[non_exhaustive]
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub enum LocalLogStorageAppendPreparationErrorCode {
    /// The token and cursor belong to different durable sessions.
    SessionMismatch,
    /// The token and cursor name different checkpoint generations.
    CheckpointLogMismatch,
    /// The token and cursor name different active generations.
    ActiveLogMismatch,
    /// The cursor does not use the selected active generation's Frame V1 policy.
    FramePolicyMismatch,
    /// Local Log Frame V1 encoding rejected the borrowed entry.
    FrameEncode,
    /// The encoded frame could not advance the active-tail cursor.
    TailTransition,
}

impl LocalLogStorageAppendPreparationErrorCode {
    /// Returns the stable namespaced error code.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::SessionMismatch => "local_log_storage_append_preparation.session_mismatch",
            Self::CheckpointLogMismatch => {
                "local_log_storage_append_preparation.checkpoint_log_mismatch"
            }
            Self::ActiveLogMismatch => "local_log_storage_append_preparation.active_log_mismatch",
            Self::FramePolicyMismatch => {
                "local_log_storage_append_preparation.frame_policy_mismatch"
            }
            Self::FrameEncode => "local_log_storage_append_preparation.frame_encode",
            Self::TailTransition => "local_log_storage_append_preparation.tail_transition",
        }
    }
}

/// Why a token-authorized storage append plan could not be prepared.
///
/// Identity mismatch variants deliberately carry no token, cursor, or entry
/// values. The recoverable failure wrapper owns the complete unchanged token
/// and cursor, while the entry remains borrowed by the caller.
#[non_exhaustive]
#[derive(Debug, Error)]
pub enum LocalLogStorageAppendPreparationError {
    /// The token's selected session differs from the cursor owner.
    #[error("the storage mutation token and tail cursor belong to different sessions")]
    SessionMismatch,
    /// The token's selected checkpoint generation differs from the cursor owner.
    #[error("the storage mutation token and tail cursor name different checkpoint logs")]
    CheckpointLogMismatch,
    /// The token's selected active generation differs from the cursor owner.
    #[error("the storage mutation token and tail cursor name different active logs")]
    ActiveLogMismatch,
    /// The cursor's fixed Frame V1 policy differs from selected storage facts.
    #[error("the storage mutation token and tail cursor use different Frame V1 policies")]
    FramePolicyMismatch,
    /// Deterministic Frame V1 encoding rejected the borrowed entry.
    #[error("storage append frame encoding failed: {0}")]
    FrameEncode(#[source] Box<LocalLogFrameCodecError>),
    /// The encoded frame could not advance semantic and physical cursor state.
    #[error("storage append tail transition failed: {0}")]
    TailTransition(#[source] Box<LocalLogTailError>),
}

impl LocalLogStorageAppendPreparationError {
    /// Returns the stable machine-readable preparation category.
    #[must_use]
    pub const fn code(&self) -> LocalLogStorageAppendPreparationErrorCode {
        match self {
            Self::SessionMismatch => LocalLogStorageAppendPreparationErrorCode::SessionMismatch,
            Self::CheckpointLogMismatch => {
                LocalLogStorageAppendPreparationErrorCode::CheckpointLogMismatch
            }
            Self::ActiveLogMismatch => LocalLogStorageAppendPreparationErrorCode::ActiveLogMismatch,
            Self::FramePolicyMismatch => {
                LocalLogStorageAppendPreparationErrorCode::FramePolicyMismatch
            }
            Self::FrameEncode(_) => LocalLogStorageAppendPreparationErrorCode::FrameEncode,
            Self::TailTransition(_) => LocalLogStorageAppendPreparationErrorCode::TailTransition,
        }
    }

    /// Returns the nested frame-codec category when encoding failed.
    #[must_use]
    pub fn frame_error_code(&self) -> Option<LocalLogFrameErrorCode> {
        match self {
            Self::FrameEncode(error) => Some(error.code()),
            _ => None,
        }
    }

    /// Returns the nested active-tail category when cursor advancement failed.
    #[must_use]
    pub fn tail_error_code(&self) -> Option<LocalLogTailErrorCode> {
        match self {
            Self::TailTransition(error) => Some(error.code()),
            _ => None,
        }
    }
}

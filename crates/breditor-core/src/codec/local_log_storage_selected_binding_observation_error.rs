use thiserror::Error;

/// Stable machine-readable category for a later-binding comparison failure.
#[non_exhaustive]
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub enum LocalLogStorageSelectedBindingObservationErrorCode {
    /// The current transaction receipt changed.
    CurrentReceiptMismatch,
    /// The immediate-predecessor receipt changed.
    PredecessorReceiptMismatch,
    /// An immutable checkpoint-generation fact changed.
    CheckpointGenerationMismatch,
    /// An immutable active-generation fact changed.
    ActiveGenerationMismatch,
    /// Cleanup state moved backward from reclaimed to retired.
    CheckpointStateRegression,
}

impl LocalLogStorageSelectedBindingObservationErrorCode {
    /// Returns the stable namespaced error code.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::CurrentReceiptMismatch => {
                "local_log_storage_selected_binding_observation.current_receipt_mismatch"
            }
            Self::PredecessorReceiptMismatch => {
                "local_log_storage_selected_binding_observation.predecessor_receipt_mismatch"
            }
            Self::CheckpointGenerationMismatch => {
                "local_log_storage_selected_binding_observation.checkpoint_generation_mismatch"
            }
            Self::ActiveGenerationMismatch => {
                "local_log_storage_selected_binding_observation.active_generation_mismatch"
            }
            Self::CheckpointStateRegression => {
                "local_log_storage_selected_binding_observation.checkpoint_state_regression"
            }
        }
    }
}

/// Why a later binding cannot represent the same still-selected envelope.
///
/// This error owns no binding, identifier, JSON, or other application payload.
/// It classifies comparison failure only; it does not itself attest storage
/// corruption or authenticate where either input came from.
#[non_exhaustive]
#[derive(Clone, Copy, Debug, Eq, Error, Hash, Ord, PartialEq, PartialOrd)]
pub enum LocalLogStorageSelectedBindingObservationError {
    /// The current transaction receipt is not exact.
    #[error("the later current receipt does not match the selected snapshot")]
    CurrentReceiptMismatch,
    /// The immediate-predecessor receipt is not exact.
    #[error("the later predecessor receipt does not match the selected snapshot")]
    PredecessorReceiptMismatch,
    /// At least one immutable checkpoint-generation fact changed.
    #[error("the later checkpoint generation changes an immutable selected fact")]
    CheckpointGenerationMismatch,
    /// At least one immutable active-generation fact changed.
    #[error("the later active generation changes an immutable selected fact")]
    ActiveGenerationMismatch,
    /// Cleanup state regressed from reclaimed to retired.
    #[error("the later checkpoint generation regresses from reclaimed to retired")]
    CheckpointStateRegression,
}

impl LocalLogStorageSelectedBindingObservationError {
    /// Returns the stable machine-readable failure category.
    #[must_use]
    pub const fn code(&self) -> LocalLogStorageSelectedBindingObservationErrorCode {
        match self {
            Self::CurrentReceiptMismatch => {
                LocalLogStorageSelectedBindingObservationErrorCode::CurrentReceiptMismatch
            }
            Self::PredecessorReceiptMismatch => {
                LocalLogStorageSelectedBindingObservationErrorCode::PredecessorReceiptMismatch
            }
            Self::CheckpointGenerationMismatch => {
                LocalLogStorageSelectedBindingObservationErrorCode::CheckpointGenerationMismatch
            }
            Self::ActiveGenerationMismatch => {
                LocalLogStorageSelectedBindingObservationErrorCode::ActiveGenerationMismatch
            }
            Self::CheckpointStateRegression => {
                LocalLogStorageSelectedBindingObservationErrorCode::CheckpointStateRegression
            }
        }
    }
}

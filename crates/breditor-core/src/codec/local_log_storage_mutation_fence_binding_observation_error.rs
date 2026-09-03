use thiserror::Error;

use super::LocalLogStorageSelectedBindingObservationErrorCode;

/// Stable category for a mutation-fence later-observation mismatch.
#[non_exhaustive]
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub enum LocalLogStorageMutationFenceBindingObservationErrorCode {
    /// A selected receipt or generation fact did not compare directionally.
    SelectedBindingMismatch,
    /// The byte-exact current selection changed.
    CurrentSelectionMismatch,
    /// The optional byte-exact predecessor selection changed shape or bytes.
    PredecessorSelectionMismatch,
    /// The mutable writer epoch changed.
    WriterEpochMismatch,
    /// The mutable current writer fence changed.
    CurrentWriterFenceMismatch,
}

impl LocalLogStorageMutationFenceBindingObservationErrorCode {
    /// Returns the stable namespaced error code.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::SelectedBindingMismatch => {
                "local_log_storage_mutation_fence_binding_observation.selected_binding_mismatch"
            }
            Self::CurrentSelectionMismatch => {
                "local_log_storage_mutation_fence_binding_observation.current_selection_mismatch"
            }
            Self::PredecessorSelectionMismatch => {
                "local_log_storage_mutation_fence_binding_observation.predecessor_selection_mismatch"
            }
            Self::WriterEpochMismatch => {
                "local_log_storage_mutation_fence_binding_observation.writer_epoch_mismatch"
            }
            Self::CurrentWriterFenceMismatch => {
                "local_log_storage_mutation_fence_binding_observation.current_writer_fence_mismatch"
            }
        }
    }
}

/// Why a later observation is not the same current mutation-fence envelope.
///
/// This error carries only a payload-free nested code when selected-binding
/// comparison fails. It never retains selection JSON or any identifier and
/// does not authenticate either input.
#[non_exhaustive]
#[derive(Clone, Copy, Debug, Eq, Error, Hash, Ord, PartialEq, PartialOrd)]
pub enum LocalLogStorageMutationFenceBindingObservationError {
    /// The full selected binding rejected a changed or regressed observation.
    #[error("the later selected binding does not match ({code:?})")]
    SelectedBindingMismatch {
        /// Stable payload-free selected-binding comparison category.
        code: LocalLogStorageSelectedBindingObservationErrorCode,
    },
    /// The current canonical selection bytes changed.
    #[error("the later current selection bytes do not match")]
    CurrentSelectionMismatch,
    /// The predecessor's presence or canonical bytes changed.
    #[error("the later predecessor selection bytes do not match")]
    PredecessorSelectionMismatch,
    /// The mutable writer epoch is not exact.
    #[error("the later writer epoch does not match")]
    WriterEpochMismatch,
    /// The mutable current writer fence is not exact.
    #[error("the later current writer fence does not match")]
    CurrentWriterFenceMismatch,
}

impl LocalLogStorageMutationFenceBindingObservationError {
    /// Returns the stable top-level mismatch category.
    #[must_use]
    pub const fn code(&self) -> LocalLogStorageMutationFenceBindingObservationErrorCode {
        match self {
            Self::SelectedBindingMismatch { .. } => {
                LocalLogStorageMutationFenceBindingObservationErrorCode::SelectedBindingMismatch
            }
            Self::CurrentSelectionMismatch => {
                LocalLogStorageMutationFenceBindingObservationErrorCode::CurrentSelectionMismatch
            }
            Self::PredecessorSelectionMismatch => {
                LocalLogStorageMutationFenceBindingObservationErrorCode::PredecessorSelectionMismatch
            }
            Self::WriterEpochMismatch => {
                LocalLogStorageMutationFenceBindingObservationErrorCode::WriterEpochMismatch
            }
            Self::CurrentWriterFenceMismatch => {
                LocalLogStorageMutationFenceBindingObservationErrorCode::CurrentWriterFenceMismatch
            }
        }
    }

    /// Returns the nested selected-binding comparison code when applicable.
    #[must_use]
    pub const fn selected_binding_code(
        &self,
    ) -> Option<LocalLogStorageSelectedBindingObservationErrorCode> {
        match self {
            Self::SelectedBindingMismatch { code } => Some(*code),
            Self::CurrentSelectionMismatch
            | Self::PredecessorSelectionMismatch
            | Self::WriterEpochMismatch
            | Self::CurrentWriterFenceMismatch => None,
        }
    }
}

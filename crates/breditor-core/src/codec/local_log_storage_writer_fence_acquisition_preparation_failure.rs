use std::{error::Error, fmt};

use crate::local_log::LocalLogStorageFenceId;

use super::{
    LocalLogStorageMutationFenceBinding, LocalLogStorageWriterFenceAcquisitionPreparationError,
    LocalLogStorageWriterFenceAcquisitionPreparationErrorCode,
};

/// Recoverable rejection of one consuming acquisition-plan preparation.
///
/// The complete expected binding and proposed fence are retained unchanged.
/// `Debug` and `Display` omit those inputs so diagnostics expose no selected
/// receipt or generation identities.
#[must_use = "a rejected acquisition preparation retains both unchanged inputs"]
pub struct LocalLogStorageWriterFenceAcquisitionPreparationFailure {
    expected_binding: Box<LocalLogStorageMutationFenceBinding>,
    proposed_writer_fence_id: LocalLogStorageFenceId,
    error: LocalLogStorageWriterFenceAcquisitionPreparationError,
}

impl LocalLogStorageWriterFenceAcquisitionPreparationFailure {
    pub(super) fn new(
        expected_binding: LocalLogStorageMutationFenceBinding,
        proposed_writer_fence_id: LocalLogStorageFenceId,
        error: LocalLogStorageWriterFenceAcquisitionPreparationError,
    ) -> Self {
        Self { expected_binding: Box::new(expected_binding), proposed_writer_fence_id, error }
    }

    /// Returns the complete unchanged expected binding.
    #[must_use]
    pub const fn expected_binding(&self) -> &LocalLogStorageMutationFenceBinding {
        &self.expected_binding
    }

    /// Returns the unchanged proposed current writer fence.
    #[must_use]
    pub const fn proposed_writer_fence_id(&self) -> &LocalLogStorageFenceId {
        &self.proposed_writer_fence_id
    }

    /// Returns the typed preparation error.
    #[must_use]
    pub const fn error(&self) -> &LocalLogStorageWriterFenceAcquisitionPreparationError {
        &self.error
    }

    /// Returns the stable machine-readable failure category.
    #[must_use]
    pub const fn code(&self) -> LocalLogStorageWriterFenceAcquisitionPreparationErrorCode {
        self.error.code()
    }

    /// Recovers both complete unchanged inputs.
    #[must_use = "the returned parts contain both unchanged preparation inputs"]
    pub fn into_inputs(self) -> (LocalLogStorageMutationFenceBinding, LocalLogStorageFenceId) {
        (*self.expected_binding, self.proposed_writer_fence_id)
    }

    /// Separates both unchanged inputs and the typed preparation error.
    #[must_use = "the returned parts contain both unchanged preparation inputs"]
    pub fn into_parts(
        self,
    ) -> (
        LocalLogStorageMutationFenceBinding,
        LocalLogStorageFenceId,
        LocalLogStorageWriterFenceAcquisitionPreparationError,
    ) {
        (*self.expected_binding, self.proposed_writer_fence_id, self.error)
    }
}

impl fmt::Debug for LocalLogStorageWriterFenceAcquisitionPreparationFailure {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("LocalLogStorageWriterFenceAcquisitionPreparationFailure")
            .field("error", &self.error)
            .finish_non_exhaustive()
    }
}

impl fmt::Display for LocalLogStorageWriterFenceAcquisitionPreparationFailure {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.error.fmt(formatter)
    }
}

impl Error for LocalLogStorageWriterFenceAcquisitionPreparationFailure {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        Some(&self.error)
    }
}

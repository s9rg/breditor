use thiserror::Error;

/// Stable category for writer-fence acquisition-plan preparation failure.
#[non_exhaustive]
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub enum LocalLogStorageWriterFenceAcquisitionPreparationErrorCode {
    /// The expected writer epoch has no representable successor.
    EpochExhausted,
    /// The proposal reused the expected current writer fence.
    CurrentWriterFenceReused,
}

impl LocalLogStorageWriterFenceAcquisitionPreparationErrorCode {
    /// Returns the stable namespaced error code.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::EpochExhausted => {
                "local_log_storage_writer_fence_acquisition_preparation.epoch_exhausted"
            }
            Self::CurrentWriterFenceReused => {
                "local_log_storage_writer_fence_acquisition_preparation.current_writer_fence_reused"
            }
        }
    }
}

/// Why an exact writer-fence acquisition plan could not be prepared.
///
/// This payload-free error does not retain the proposed identity or expected
/// binding. The recoverable failure wrapper owns both unchanged inputs.
#[non_exhaustive]
#[derive(Clone, Copy, Debug, Eq, Error, Hash, Ord, PartialEq, PartialOrd)]
pub enum LocalLogStorageWriterFenceAcquisitionPreparationError {
    /// The expected epoch is `u64::MAX` and must never wrap.
    #[error("the writer epoch is exhausted")]
    EpochExhausted,
    /// Acquisition must change the mutable current writer fence.
    #[error("the proposed writer fence reuses the current writer fence")]
    CurrentWriterFenceReused,
}

impl LocalLogStorageWriterFenceAcquisitionPreparationError {
    /// Returns the stable machine-readable preparation category.
    #[must_use]
    pub const fn code(&self) -> LocalLogStorageWriterFenceAcquisitionPreparationErrorCode {
        match self {
            Self::EpochExhausted => {
                LocalLogStorageWriterFenceAcquisitionPreparationErrorCode::EpochExhausted
            }
            Self::CurrentWriterFenceReused => {
                LocalLogStorageWriterFenceAcquisitionPreparationErrorCode::CurrentWriterFenceReused
            }
        }
    }
}

use thiserror::Error;

/// Why a numeric local-log storage writer epoch cannot be constructed.
#[non_exhaustive]
#[derive(Clone, Copy, Debug, Eq, Error, PartialEq)]
pub enum LocalLogStorageWriterEpochValueError {
    /// Zero is the uninitialized sentinel and never identifies a writer epoch.
    #[error("local-log storage writer epoch zero is reserved")]
    Zero,
}

impl LocalLogStorageWriterEpochValueError {
    /// Returns the stable namespaced error code.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Zero => "local_log_storage_writer_epoch.zero",
        }
    }
}

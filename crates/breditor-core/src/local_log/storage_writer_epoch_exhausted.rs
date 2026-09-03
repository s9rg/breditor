use thiserror::Error;

/// Failure to advance a local-log storage writer epoch beyond `u64::MAX`.
///
/// Epochs never wrap because reuse would make an obsolete writer comparison
/// indistinguishable from a current one.
#[derive(Clone, Copy, Debug, Eq, Error, PartialEq)]
#[error("local-log storage writer epoch is exhausted")]
pub struct LocalLogStorageWriterEpochExhausted;

impl LocalLogStorageWriterEpochExhausted {
    /// Returns the stable namespaced error code.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        "local_log_storage_writer_epoch.exhausted"
    }
}

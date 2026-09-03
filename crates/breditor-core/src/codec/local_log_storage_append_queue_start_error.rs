use thiserror::Error;

/// Stable category for rejecting the first plan from an append queue.
#[non_exhaustive]
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub enum LocalLogStorageAppendQueueStartErrorCode {
    /// The selected queue policy permits no first pending frame.
    PendingFrameLimit,
    /// The first exact frame exceeds the aggregate pending-byte policy.
    PendingByteLimit,
}

impl LocalLogStorageAppendQueueStartErrorCode {
    /// Returns the stable namespaced error code.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::PendingFrameLimit => "local_log_storage_append_queue_start.pending_frame_limit",
            Self::PendingByteLimit => "local_log_storage_append_queue_start.pending_byte_limit",
        }
    }
}

/// Why one checked append plan cannot begin a bounded FIFO queue.
#[non_exhaustive]
#[derive(Clone, Copy, Debug, Eq, Error, PartialEq)]
pub enum LocalLogStorageAppendQueueStartError {
    /// One pending frame exceeds the selected frame-count policy.
    #[error("the first append frame exceeds the pending-frame limit {maximum}")]
    PendingFrameLimit {
        /// Selected maximum pending frames.
        maximum: u64,
    },
    /// The first exact frame exceeds the selected aggregate-byte policy.
    #[error(
        "the first append frame has {actual} encoded bytes; the pending-byte limit is {maximum}"
    )]
    PendingByteLimit {
        /// Exact encoded bytes in the first frame.
        actual: u64,
        /// Selected maximum aggregate pending bytes.
        maximum: u64,
    },
}

impl LocalLogStorageAppendQueueStartError {
    /// Returns the stable machine-readable rejection category.
    #[must_use]
    pub const fn code(self) -> LocalLogStorageAppendQueueStartErrorCode {
        match self {
            Self::PendingFrameLimit { .. } => {
                LocalLogStorageAppendQueueStartErrorCode::PendingFrameLimit
            }
            Self::PendingByteLimit { .. } => {
                LocalLogStorageAppendQueueStartErrorCode::PendingByteLimit
            }
        }
    }
}

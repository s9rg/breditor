use thiserror::Error;

use super::{
    LocalLogFrameCodecError, LocalLogFrameErrorCode, LocalLogTailError, LocalLogTailErrorCode,
};

/// Stable category for one append-queue enqueue failure.
#[non_exhaustive]
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub enum LocalLogStorageAppendQueueEnqueueErrorCode {
    /// Adding one to the retained frame count is unrepresentable.
    PendingFrameCountOverflow,
    /// The next frame would exceed the retained frame-count policy.
    PendingFrameLimit,
    /// Local Log Frame V1 encoding rejected the borrowed entry.
    FrameEncode,
    /// The encoded frame length cannot be represented as `u64`.
    FrameBytesOverflow,
    /// Adding the exact frame length to retained bytes is unrepresentable.
    PendingBytesOverflow,
    /// The next exact frame would exceed the aggregate pending-byte policy.
    PendingByteLimit,
    /// The encoded frame could not advance the speculative tail cursor.
    TailTransition,
}

impl LocalLogStorageAppendQueueEnqueueErrorCode {
    /// Returns the stable namespaced error code.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::PendingFrameCountOverflow => {
                "local_log_storage_append_queue_enqueue.pending_frame_count_overflow"
            }
            Self::PendingFrameLimit => "local_log_storage_append_queue_enqueue.pending_frame_limit",
            Self::FrameEncode => "local_log_storage_append_queue_enqueue.frame_encode",
            Self::FrameBytesOverflow => {
                "local_log_storage_append_queue_enqueue.frame_bytes_overflow"
            }
            Self::PendingBytesOverflow => {
                "local_log_storage_append_queue_enqueue.pending_bytes_overflow"
            }
            Self::PendingByteLimit => "local_log_storage_append_queue_enqueue.pending_byte_limit",
            Self::TailTransition => "local_log_storage_append_queue_enqueue.tail_transition",
        }
    }
}

/// Why one borrowed entry could not join a speculative append queue.
#[non_exhaustive]
#[derive(Debug, Error)]
pub enum LocalLogStorageAppendQueueEnqueueError {
    /// The queue's fixed-width pending-frame count cannot advance.
    #[error("the pending append-frame count cannot advance beyond u64::MAX")]
    PendingFrameCountOverflow,
    /// The prospective frame count exceeds the selected queue policy.
    #[error("the append would retain {attempted} frames; the pending-frame limit is {maximum}")]
    PendingFrameLimit {
        /// Prospective pending frame count.
        attempted: u64,
        /// Selected maximum pending frames.
        maximum: u64,
    },
    /// Deterministic Frame V1 encoding rejected the borrowed entry.
    #[error("queued append frame encoding failed: {0}")]
    FrameEncode(#[source] Box<LocalLogFrameCodecError>),
    /// The platform-sized encoded frame length cannot enter fixed-width totals.
    #[error("an encoded append frame with {frame_bytes} bytes cannot be represented as u64")]
    FrameBytesOverflow {
        /// Platform-sized exact encoded frame length.
        frame_bytes: usize,
    },
    /// Aggregate pending-byte addition overflowed `u64`.
    #[error("pending append bytes overflow when adding {added} encoded bytes to {current} bytes")]
    PendingBytesOverflow {
        /// Exact bytes already retained.
        current: u64,
        /// Exact encoded bytes proposed for the next frame.
        added: u64,
    },
    /// The prospective aggregate encoded bytes exceed the queue policy.
    #[error(
        "the append would retain {attempted} encoded bytes; the pending-byte limit is {maximum}"
    )]
    PendingByteLimit {
        /// Prospective aggregate encoded bytes.
        attempted: u64,
        /// Selected maximum aggregate pending bytes.
        maximum: u64,
    },
    /// The exact encoded frame could not advance the speculative cursor.
    #[error("queued append tail transition failed: {0}")]
    TailTransition(#[source] Box<LocalLogTailError>),
}

impl LocalLogStorageAppendQueueEnqueueError {
    /// Returns the stable machine-readable enqueue category.
    #[must_use]
    pub const fn code(&self) -> LocalLogStorageAppendQueueEnqueueErrorCode {
        match self {
            Self::PendingFrameCountOverflow => {
                LocalLogStorageAppendQueueEnqueueErrorCode::PendingFrameCountOverflow
            }
            Self::PendingFrameLimit { .. } => {
                LocalLogStorageAppendQueueEnqueueErrorCode::PendingFrameLimit
            }
            Self::FrameEncode(_) => LocalLogStorageAppendQueueEnqueueErrorCode::FrameEncode,
            Self::FrameBytesOverflow { .. } => {
                LocalLogStorageAppendQueueEnqueueErrorCode::FrameBytesOverflow
            }
            Self::PendingBytesOverflow { .. } => {
                LocalLogStorageAppendQueueEnqueueErrorCode::PendingBytesOverflow
            }
            Self::PendingByteLimit { .. } => {
                LocalLogStorageAppendQueueEnqueueErrorCode::PendingByteLimit
            }
            Self::TailTransition(_) => LocalLogStorageAppendQueueEnqueueErrorCode::TailTransition,
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

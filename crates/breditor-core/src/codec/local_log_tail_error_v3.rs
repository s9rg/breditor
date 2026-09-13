use thiserror::Error;

use crate::local_log::LocalLogRecoveryError;

use super::{LocalLogFrameV3CodecError, LocalLogTailErrorCode};

/// Why one consuming Frame V3 tail transition could not publish progress.
#[non_exhaustive]
#[derive(Debug, Error)]
pub enum LocalLogTailErrorV3 {
    /// The caller asserted a different physical origin for input byte zero.
    #[error(
        "caller asserted local-log tail input starts at byte {actual}; expected accepted byte {expected}"
    )]
    InputOriginMismatch {
        /// Cursor-authoritative next byte.
        expected: u64,
        /// Caller-asserted origin of input byte zero.
        actual: u64,
    },
    /// A complete platform-sized frame cannot fit the durable offset type.
    #[error(
        "local-log tail consumed frame length {consumed_bytes} cannot fit the durable u64 offset"
    )]
    ConsumedBytesOverflow {
        /// Complete frame length reported by the borrowed scanner.
        consumed_bytes: usize,
    },
    /// Current accepted offset plus the complete frame length overflowed.
    #[error(
        "local-log tail accepted byte offset {accepted_bytes} cannot advance by {consumed_bytes}"
    )]
    AcceptedOffsetOverflow {
        /// Unchanged accepted byte offset.
        accepted_bytes: u64,
        /// Complete frame length converted to the durable offset domain.
        consumed_bytes: u64,
    },
    /// Local Log Frame V3 structure or checksum validation failed.
    #[error("local-log tail Frame V3 scan failed: {0}")]
    FrameScan(#[source] Box<LocalLogFrameV3CodecError>),
    /// Local Log Entry V3 decoding or owner-derived binding failed.
    #[error("local-log tail Frame V3 decode failed: {0}")]
    FrameDecode(#[source] Box<LocalLogFrameV3CodecError>),
    /// The active generation rejected the decoded physical observation.
    #[error("local-log tail admission failed: {0}")]
    Admission(#[source] Box<LocalLogRecoveryError>),
}

impl LocalLogTailErrorV3 {
    /// Returns the stable machine-readable tail failure category.
    #[must_use]
    pub const fn code(&self) -> LocalLogTailErrorCode {
        match self {
            Self::InputOriginMismatch { .. } => LocalLogTailErrorCode::InputOriginMismatch,
            Self::ConsumedBytesOverflow { .. } => LocalLogTailErrorCode::ConsumedBytesOverflow,
            Self::AcceptedOffsetOverflow { .. } => LocalLogTailErrorCode::AcceptedOffsetOverflow,
            Self::FrameScan(_) => LocalLogTailErrorCode::FrameScan,
            Self::FrameDecode(_) => LocalLogTailErrorCode::FrameDecode,
            Self::Admission(_) => LocalLogTailErrorCode::Admission,
        }
    }

    /// Returns the nested Frame V3 scan failure when present.
    #[must_use]
    pub fn frame_scan_error(&self) -> Option<&LocalLogFrameV3CodecError> {
        match self {
            Self::FrameScan(error) => Some(error),
            _ => None,
        }
    }

    /// Returns the nested Frame V3 semantic failure when present.
    #[must_use]
    pub fn frame_decode_error(&self) -> Option<&LocalLogFrameV3CodecError> {
        match self {
            Self::FrameDecode(error) => Some(error),
            _ => None,
        }
    }

    /// Returns the nested active-generation rejection when present.
    #[must_use]
    pub fn admission_error(&self) -> Option<&LocalLogRecoveryError> {
        match self {
            Self::Admission(error) => Some(error),
            _ => None,
        }
    }
}

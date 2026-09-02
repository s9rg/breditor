use thiserror::Error;

use crate::local_log::LocalLogRecoveryError;

use super::LocalLogFrameCodecError;

/// Stable category for one failed active-tail cursor transition.
#[non_exhaustive]
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub enum LocalLogTailErrorCode {
    /// The caller-asserted input origin differs from the accepted offset.
    InputOriginMismatch,
    /// One platform frame length cannot fit the durable `u64` offset domain.
    ConsumedBytesOverflow,
    /// Advancing the accepted durable offset would exceed `u64::MAX`.
    AcceptedOffsetOverflow,
    /// Binary frame scanning failed.
    FrameScan,
    /// Semantic frame decoding or trusted binding failed.
    FrameDecode,
    /// The decoded entry was rejected by active-generation admission.
    Admission,
}

impl LocalLogTailErrorCode {
    /// Returns the stable namespaced error code.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::InputOriginMismatch => "local_log_tail.input_origin_mismatch",
            Self::ConsumedBytesOverflow => "local_log_tail.consumed_bytes_overflow",
            Self::AcceptedOffsetOverflow => "local_log_tail.accepted_offset_overflow",
            Self::FrameScan => "local_log_tail.frame_scan",
            Self::FrameDecode => "local_log_tail.frame_decode",
            Self::Admission => "local_log_tail.admission",
        }
    }
}

/// Why one consuming active-tail cursor transition could not publish progress.
#[non_exhaustive]
#[derive(Debug, Error)]
pub enum LocalLogTailError {
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
    /// Local Log Frame V1 structure or checksum validation failed.
    #[error("local-log tail frame scan failed: {0}")]
    FrameScan(#[source] Box<LocalLogFrameCodecError>),
    /// Local Log Entry V1 decoding or owner-derived binding failed.
    #[error("local-log tail frame decode failed: {0}")]
    FrameDecode(#[source] Box<LocalLogFrameCodecError>),
    /// The active generation rejected the decoded physical observation.
    #[error("local-log tail admission failed: {0}")]
    Admission(#[source] Box<LocalLogRecoveryError>),
}

impl LocalLogTailError {
    /// Returns the stable machine-readable failure category.
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

    /// Returns the nested frame-scan failure when this is a scan error.
    #[must_use]
    pub fn frame_scan_error(&self) -> Option<&LocalLogFrameCodecError> {
        match self {
            Self::FrameScan(error) => Some(error),
            _ => None,
        }
    }

    /// Returns the nested semantic-frame failure when this is a decode error.
    #[must_use]
    pub fn frame_decode_error(&self) -> Option<&LocalLogFrameCodecError> {
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

#[cfg(test)]
mod tests {
    use super::LocalLogTailErrorCode;

    #[test]
    fn tail_error_codes_are_stable_and_namespaced() {
        let cases = [
            (LocalLogTailErrorCode::InputOriginMismatch, "local_log_tail.input_origin_mismatch"),
            (
                LocalLogTailErrorCode::ConsumedBytesOverflow,
                "local_log_tail.consumed_bytes_overflow",
            ),
            (
                LocalLogTailErrorCode::AcceptedOffsetOverflow,
                "local_log_tail.accepted_offset_overflow",
            ),
            (LocalLogTailErrorCode::FrameScan, "local_log_tail.frame_scan"),
            (LocalLogTailErrorCode::FrameDecode, "local_log_tail.frame_decode"),
            (LocalLogTailErrorCode::Admission, "local_log_tail.admission"),
        ];

        for (code, expected) in cases {
            assert_eq!(code.as_str(), expected);
        }
    }
}

use thiserror::Error;

use crate::local_log::{LocalLogId, LocalSessionId};

use super::LocalLogEntryCodecError;

/// Stable category for one rejected Local Log Frame V1 operation.
#[non_exhaustive]
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub enum LocalLogFrameErrorCode {
    /// An entry belongs to another durable session.
    SessionMismatch,
    /// An entry belongs to another append generation.
    ActiveLogMismatch,
    /// Local Log Entry V1 encoding or semantic decoding failed.
    InvalidEntry,
    /// A payload length cannot fit the frame's fixed-width length field.
    PayloadLengthOverflow,
    /// The declared or encoded payload exceeds a host policy.
    PayloadTooLarge,
    /// Header and payload length cannot fit one valid Rust slice.
    FrameLengthOverflow,
    /// The fixed frame magic does not match Local Log Frame V1.
    UnsupportedMagic,
    /// The fixed header failed its accidental-corruption check.
    HeaderChecksumMismatch,
    /// The frame version is not implemented.
    UnsupportedVersion,
    /// A reserved frame flag is nonzero.
    UnsupportedFlags,
    /// The complete payload failed its accidental-corruption check.
    PayloadChecksumMismatch,
    /// The checksummed payload is not UTF-8.
    InvalidUtf8,
}

impl LocalLogFrameErrorCode {
    /// Returns the stable namespaced error code.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::SessionMismatch => "local_log_frame.session_mismatch",
            Self::ActiveLogMismatch => "local_log_frame.active_log_mismatch",
            Self::InvalidEntry => "local_log_frame.invalid_entry",
            Self::PayloadLengthOverflow => "local_log_frame.payload_length_overflow",
            Self::PayloadTooLarge => "local_log_frame.payload_too_large",
            Self::FrameLengthOverflow => "local_log_frame.frame_length_overflow",
            Self::UnsupportedMagic => "local_log_frame.unsupported_magic",
            Self::HeaderChecksumMismatch => "local_log_frame.header_checksum_mismatch",
            Self::UnsupportedVersion => "local_log_frame.unsupported_version",
            Self::UnsupportedFlags => "local_log_frame.unsupported_flags",
            Self::PayloadChecksumMismatch => "local_log_frame.payload_checksum_mismatch",
            Self::InvalidUtf8 => "local_log_frame.invalid_utf8",
        }
    }
}

/// Why one active-tail frame could not encode, scan, or decode an entry.
#[non_exhaustive]
#[derive(Debug, Error)]
pub enum LocalLogFrameCodecError {
    /// The entry asserts another durable session.
    #[error("local-log frame belongs to session {actual}; expected {expected}")]
    SessionMismatch {
        /// Trusted session identity.
        expected: LocalSessionId,
        /// Entry-asserted session identity.
        actual: LocalSessionId,
    },
    /// The entry asserts another append generation.
    #[error("local-log frame belongs to active log {actual}; expected {expected}")]
    ActiveLogMismatch {
        /// Trusted active-generation identity.
        expected: LocalLogId,
        /// Entry-asserted generation identity.
        actual: LocalLogId,
    },
    /// The Local Log Entry V1 semantic codec rejected the payload.
    #[error("invalid local-log frame entry: {0}")]
    InvalidEntry(#[source] Box<LocalLogEntryCodecError>),
    /// A payload slice contains more bytes than a `u64` length can represent.
    #[error("local-log frame payload is {actual} bytes; the fixed-width maximum is {maximum}")]
    PayloadLengthOverflow {
        /// Actual encoded payload bytes.
        actual: usize,
        /// Largest representable frame payload.
        maximum: u64,
    },
    /// The fixed-width payload length exceeds the effective host policy.
    #[error("local-log frame payload is {actual} bytes; the configured maximum is {maximum}")]
    PayloadTooLarge {
        /// Declared or encoded payload bytes.
        actual: u64,
        /// Smaller of the frame and semantic JSON ceilings.
        maximum: u64,
    },
    /// Header plus payload cannot fit one valid Rust slice on this platform.
    #[error(
        "local-log frame length exceeds this platform's slice limit for payload {payload_bytes}"
    )]
    FrameLengthOverflow {
        /// Fixed-width payload bytes read from or written to the header.
        payload_bytes: u64,
    },
    /// The fixed eight-byte magic is not Local Log Frame V1.
    #[error("unsupported local-log frame magic")]
    UnsupportedMagic,
    /// The complete fixed header does not match its stored CRC-32C.
    #[error(
        "local-log frame header checksum mismatch: stored 0x{stored:08x}, computed 0x{computed:08x}"
    )]
    HeaderChecksumMismatch {
        /// CRC-32C value stored in the header.
        stored: u32,
        /// CRC-32C value computed from the preceding header bytes.
        computed: u32,
    },
    /// The checksum-valid header names another frame format version.
    #[error("unsupported local-log frame version {found}; this codec supports {supported}")]
    UnsupportedVersion {
        /// Version found in the header.
        found: u16,
        /// Version implemented by this codec.
        supported: u16,
    },
    /// A checksum-valid reserved header flag is nonzero.
    #[error("unsupported local-log frame flags 0x{found:04x}")]
    UnsupportedFlags {
        /// Complete fixed-width flag field.
        found: u16,
    },
    /// The complete payload does not match its stored CRC-32C.
    #[error(
        "local-log frame payload checksum mismatch: stored 0x{stored:08x}, computed 0x{computed:08x}"
    )]
    PayloadChecksumMismatch {
        /// CRC-32C value stored in the header.
        stored: u32,
        /// CRC-32C value computed from the exact payload bytes.
        computed: u32,
    },
    /// The complete checksummed payload is not valid UTF-8.
    #[error("local-log frame payload is not UTF-8 at byte {valid_up_to}")]
    InvalidUtf8 {
        /// First payload byte not proved valid UTF-8.
        valid_up_to: usize,
    },
}

impl LocalLogFrameCodecError {
    /// Returns the stable machine-readable failure category.
    #[must_use]
    pub const fn code(&self) -> LocalLogFrameErrorCode {
        match self {
            Self::SessionMismatch { .. } => LocalLogFrameErrorCode::SessionMismatch,
            Self::ActiveLogMismatch { .. } => LocalLogFrameErrorCode::ActiveLogMismatch,
            Self::InvalidEntry(_) => LocalLogFrameErrorCode::InvalidEntry,
            Self::PayloadLengthOverflow { .. } => LocalLogFrameErrorCode::PayloadLengthOverflow,
            Self::PayloadTooLarge { .. } => LocalLogFrameErrorCode::PayloadTooLarge,
            Self::FrameLengthOverflow { .. } => LocalLogFrameErrorCode::FrameLengthOverflow,
            Self::UnsupportedMagic => LocalLogFrameErrorCode::UnsupportedMagic,
            Self::HeaderChecksumMismatch { .. } => LocalLogFrameErrorCode::HeaderChecksumMismatch,
            Self::UnsupportedVersion { .. } => LocalLogFrameErrorCode::UnsupportedVersion,
            Self::UnsupportedFlags { .. } => LocalLogFrameErrorCode::UnsupportedFlags,
            Self::PayloadChecksumMismatch { .. } => LocalLogFrameErrorCode::PayloadChecksumMismatch,
            Self::InvalidUtf8 { .. } => LocalLogFrameErrorCode::InvalidUtf8,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::LocalLogFrameErrorCode;

    #[test]
    fn frame_error_codes_are_stable_and_namespaced() {
        let cases = [
            (LocalLogFrameErrorCode::SessionMismatch, "local_log_frame.session_mismatch"),
            (LocalLogFrameErrorCode::ActiveLogMismatch, "local_log_frame.active_log_mismatch"),
            (LocalLogFrameErrorCode::InvalidEntry, "local_log_frame.invalid_entry"),
            (
                LocalLogFrameErrorCode::PayloadLengthOverflow,
                "local_log_frame.payload_length_overflow",
            ),
            (LocalLogFrameErrorCode::PayloadTooLarge, "local_log_frame.payload_too_large"),
            (LocalLogFrameErrorCode::FrameLengthOverflow, "local_log_frame.frame_length_overflow"),
            (LocalLogFrameErrorCode::UnsupportedMagic, "local_log_frame.unsupported_magic"),
            (
                LocalLogFrameErrorCode::HeaderChecksumMismatch,
                "local_log_frame.header_checksum_mismatch",
            ),
            (LocalLogFrameErrorCode::UnsupportedVersion, "local_log_frame.unsupported_version"),
            (LocalLogFrameErrorCode::UnsupportedFlags, "local_log_frame.unsupported_flags"),
            (
                LocalLogFrameErrorCode::PayloadChecksumMismatch,
                "local_log_frame.payload_checksum_mismatch",
            ),
            (LocalLogFrameErrorCode::InvalidUtf8, "local_log_frame.invalid_utf8"),
        ];

        for (code, expected) in cases {
            assert_eq!(code.as_str(), expected);
        }
    }
}

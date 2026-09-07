use thiserror::Error;

use crate::local_log::{LocalLogId, LocalSessionId};

use super::{LocalLogEntryV2CodecError, LocalLogFrameErrorCode};

/// Why one Local Log Frame V2 operation was rejected.
#[non_exhaustive]
#[derive(Debug, Error)]
pub enum LocalLogFrameV2CodecError {
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
    /// The Local Log Entry V2 semantic codec rejected the payload.
    #[error("invalid local-log frame V2 entry: {0}")]
    InvalidEntry(#[source] Box<LocalLogEntryV2CodecError>),
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
    /// The fixed eight-byte magic is not a Local Log Frame.
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

impl LocalLogFrameV2CodecError {
    /// Returns the stable machine-readable frame failure category.
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

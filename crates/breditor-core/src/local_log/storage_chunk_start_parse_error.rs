use thiserror::Error;

/// Stable category for a fixed-width storage chunk-start parse failure.
#[non_exhaustive]
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub enum LocalLogStorageChunkStartParseErrorCode {
    /// The representation is not exactly twenty UTF-8 bytes.
    InvalidLength,
    /// The representation contains a character outside ASCII decimal digits.
    InvalidDigit,
    /// The represented decimal integer exceeds `u64::MAX`.
    Overflow,
}

impl LocalLogStorageChunkStartParseErrorCode {
    /// Returns the stable namespaced error code.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::InvalidLength => "local_log_storage_chunk_start_parse.invalid_length",
            Self::InvalidDigit => "local_log_storage_chunk_start_parse.invalid_digit",
            Self::Overflow => "local_log_storage_chunk_start_parse.overflow",
        }
    }
}

/// Why text cannot identify one canonical storage chunk start.
///
/// The accepted representation is exactly twenty ASCII decimal digits. The
/// error retains only bounded structural detail and never the rejected input.
#[non_exhaustive]
#[derive(Clone, Copy, Debug, Eq, Error, PartialEq)]
pub enum LocalLogStorageChunkStartParseError {
    /// The representation is not exactly twenty UTF-8 bytes.
    #[error(
        "local-log storage chunk start has {actual_bytes} bytes; exactly {expected_bytes} are required"
    )]
    InvalidLength {
        /// Actual UTF-8 byte length.
        actual_bytes: usize,
        /// Required canonical UTF-8 byte length.
        expected_bytes: usize,
    },
    /// The representation contains a non-ASCII-decimal character.
    #[error(
        "local-log storage chunk start has invalid character `{character}` at byte {byte_index}"
    )]
    InvalidDigit {
        /// Byte position of the first rejected character.
        byte_index: usize,
        /// First rejected character.
        character: char,
    },
    /// The represented integer exceeds `u64::MAX`.
    #[error("local-log storage chunk start exceeds the canonical u64 decimal range")]
    Overflow,
}

impl LocalLogStorageChunkStartParseError {
    /// Returns the stable machine-readable parse category.
    #[must_use]
    pub const fn code(&self) -> LocalLogStorageChunkStartParseErrorCode {
        match self {
            Self::InvalidLength { .. } => LocalLogStorageChunkStartParseErrorCode::InvalidLength,
            Self::InvalidDigit { .. } => LocalLogStorageChunkStartParseErrorCode::InvalidDigit,
            Self::Overflow => LocalLogStorageChunkStartParseErrorCode::Overflow,
        }
    }
}

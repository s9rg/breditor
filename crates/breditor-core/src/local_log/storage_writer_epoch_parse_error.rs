use thiserror::Error;

/// Why text cannot identify a canonical local-log storage writer epoch.
///
/// The accepted representation is the shortest unsigned ASCII decimal form of
/// a nonzero `u64`. These variants let adapters reject malformed persisted
/// values without retaining the rejected input.
#[non_exhaustive]
#[derive(Clone, Copy, Debug, Eq, Error, PartialEq)]
pub enum LocalLogStorageWriterEpochParseError {
    /// The representation contains no bytes.
    #[error("local-log storage writer epoch cannot be empty")]
    Empty,
    /// The representation begins with an explicit plus or minus sign.
    #[error("local-log storage writer epoch must not contain a sign")]
    Sign,
    /// The representation contains whitespace.
    #[error("local-log storage writer epoch contains whitespace at byte {byte_index}")]
    Whitespace {
        /// Byte position of the first rejected whitespace character.
        byte_index: usize,
    },
    /// A multi-digit representation begins with zero.
    #[error("local-log storage writer epoch must not contain a leading zero")]
    LeadingZero,
    /// The representation contains a character outside ASCII decimal digits.
    #[error(
        "local-log storage writer epoch has invalid character `{character}` at byte {byte_index}"
    )]
    InvalidDigit {
        /// Byte position of the first rejected character.
        byte_index: usize,
        /// First rejected character.
        character: char,
    },
    /// The representation is exactly the reserved value zero.
    #[error("local-log storage writer epoch zero is reserved")]
    Zero,
    /// The representation exceeds the canonical byte bound or `u64::MAX`.
    #[error("local-log storage writer epoch exceeds the canonical u64 decimal range")]
    Overflow,
}

impl LocalLogStorageWriterEpochParseError {
    /// Returns the stable namespaced error code.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Empty => "local_log_storage_writer_epoch_parse.empty",
            Self::Sign => "local_log_storage_writer_epoch_parse.sign",
            Self::Whitespace { .. } => "local_log_storage_writer_epoch_parse.whitespace",
            Self::LeadingZero => "local_log_storage_writer_epoch_parse.leading_zero",
            Self::InvalidDigit { .. } => "local_log_storage_writer_epoch_parse.invalid_digit",
            Self::Zero => "local_log_storage_writer_epoch_parse.zero",
            Self::Overflow => "local_log_storage_writer_epoch_parse.overflow",
        }
    }
}

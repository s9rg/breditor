use thiserror::Error;

/// Why canonical schema-fingerprint text could not be parsed.
///
/// The error retains only bounded structural metadata. It never retains or
/// echoes the caller's fingerprint text.
#[derive(Clone, Copy, Debug, Eq, Error, PartialEq)]
#[non_exhaustive]
pub enum SchemaFingerprintParseError {
    /// The UTF-8 byte length is not the one fixed by the text contract.
    #[error("schema fingerprint text is {actual} bytes; expected exactly {expected}")]
    InvalidLength {
        /// Actual UTF-8 byte length.
        actual: usize,
        /// Required UTF-8 byte length.
        expected: usize,
    },
    /// The text does not begin with the required algorithm prefix.
    #[error("schema fingerprint must begin with `sha256:`")]
    InvalidPrefix,
    /// A digest byte is not represented by lowercase hexadecimal ASCII.
    #[error("schema fingerprint contains a non-lowercase-hex byte at byte index {index}")]
    InvalidHexDigit {
        /// Zero-based byte index in the complete fingerprint text.
        index: usize,
    },
}

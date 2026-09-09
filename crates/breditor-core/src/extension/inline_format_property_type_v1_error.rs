use thiserror::Error;

use crate::document::PropertyInteger;

/// Why a typed inline-format property domain could not be constructed.
#[derive(Clone, Copy, Debug, Eq, Error, PartialEq)]
#[non_exhaustive]
pub enum InlineFormatPropertyTypeV1Error {
    /// The inclusive integer range is reversed.
    #[error("inline-format property integer minimum {minimum:?} exceeds maximum {maximum:?}")]
    InvalidIntegerRange {
        /// Rejected lower bound.
        minimum: PropertyInteger,
        /// Rejected upper bound.
        maximum: PropertyInteger,
    },
    /// The inclusive UTF-8 byte-length range is reversed.
    #[error(
        "inline-format property string minimum {minimum_utf8_bytes} exceeds maximum {maximum_utf8_bytes} UTF-8 bytes"
    )]
    InvalidStringByteRange {
        /// Rejected lower bound.
        minimum_utf8_bytes: u32,
        /// Rejected upper bound.
        maximum_utf8_bytes: u32,
    },
    /// The declared string ceiling exceeds the fixed cross-runtime ceiling.
    #[error(
        "inline-format property string maximum is {actual} UTF-8 bytes; the implementation ceiling is {maximum}"
    )]
    StringMaximumTooLarge {
        /// Rejected maximum.
        actual: u32,
        /// Fixed implementation ceiling.
        maximum: u32,
    },
}

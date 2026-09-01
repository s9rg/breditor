use std::{fmt, sync::Arc};

use thiserror::Error;

/// Maximum encoded length of a caller-supplied snapshot lineage.
pub const MAX_LINEAGE_ID_BYTES: usize = 128;

/// Stable caller-supplied identity for one linear editor-state history.
///
/// The deterministic core never generates lineage IDs from clocks, randomness,
/// or memory addresses.
#[derive(Clone, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct LineageId(Arc<str>);

impl LineageId {
    /// Validates an opaque lineage identifier.
    ///
    /// # Errors
    ///
    /// Returns [`LineageIdError`] for an empty, oversized, or non-portable ID.
    pub fn try_new(value: impl AsRef<str>) -> Result<Self, LineageIdError> {
        let value = value.as_ref();
        if value.is_empty() {
            return Err(LineageIdError::Empty);
        }
        if value.len() > MAX_LINEAGE_ID_BYTES {
            return Err(LineageIdError::TooLong {
                actual: value.len(),
                maximum: MAX_LINEAGE_ID_BYTES,
            });
        }
        let mut characters = value.char_indices();
        let Some((_, first)) = characters.next() else {
            return Err(LineageIdError::Empty);
        };
        if !first.is_ascii_alphanumeric() {
            return Err(LineageIdError::InvalidStart);
        }
        for (byte_index, character) in characters {
            if !(character.is_ascii_alphanumeric() || matches!(character, '.' | '_' | ':' | '-')) {
                return Err(LineageIdError::InvalidCharacter { byte_index, character });
            }
        }
        Ok(Self(Arc::from(value)))
    }

    /// Returns the exact encoded identifier.
    #[must_use]
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl fmt::Debug for LineageId {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.debug_tuple("LineageId").field(&self.as_str()).finish()
    }
}

impl fmt::Display for LineageId {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(self.as_str())
    }
}

/// Why a value cannot identify an editor-state lineage.
#[derive(Clone, Debug, Eq, Error, PartialEq)]
pub enum LineageIdError {
    /// The identifier is empty.
    #[error("a lineage ID cannot be empty")]
    Empty,
    /// The encoded identifier exceeds the protocol limit.
    #[error("lineage ID is {actual} bytes; the limit is {maximum}")]
    TooLong {
        /// Actual encoded length.
        actual: usize,
        /// Maximum accepted encoded length.
        maximum: usize,
    },
    /// The first character is not an ASCII letter or digit.
    #[error("a lineage ID must begin with an ASCII letter or digit")]
    InvalidStart,
    /// A character is outside the portable opaque-ID grammar.
    #[error("lineage ID has invalid character `{character}` at byte {byte_index}")]
    InvalidCharacter {
        /// Byte position of the rejected character.
        byte_index: usize,
        /// Rejected character.
        character: char,
    },
}

use std::{fmt, str::FromStr};

use super::LocalLogStorageChunkStartParseError;

/// UTF-8 bytes in one canonical local-log storage chunk-start key component.
pub const LOCAL_LOG_STORAGE_CHUNK_START_DECIMAL_BYTES: usize = 20;

/// Generation-relative byte offset at which one storage chunk begins.
///
/// Profile text is exactly twenty zero-padded ASCII decimal digits. This keeps
/// lexicographic key order equal to numeric byte order across the complete
/// `u64` domain. The value is a physical position, not a logical sequence,
/// frame count, storage observation, or writer authority.
///
/// Chunk starts cannot be substituted for session-global log sequences:
///
/// ```compile_fail
/// fn expects_chunk_start(_: breditor_core::local_log::LocalLogStorageChunkStart) {}
/// expects_chunk_start(breditor_core::local_log::LocalLogSequence::FIRST);
/// ```
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct LocalLogStorageChunkStart(u64);

impl LocalLogStorageChunkStart {
    /// The first byte position in a storage generation.
    pub const ZERO: Self = Self(0);

    /// The final representable storage chunk start.
    pub const MAX: Self = Self(u64::MAX);

    /// Creates one generation-relative chunk start.
    #[must_use]
    pub const fn new(value: u64) -> Self {
        Self(value)
    }

    /// Returns the numeric generation-relative byte offset.
    #[must_use]
    pub const fn get(self) -> u64 {
        self.0
    }
}

impl fmt::Display for LocalLogStorageChunkStart {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(formatter, "{:020}", self.0)
    }
}

impl From<u64> for LocalLogStorageChunkStart {
    fn from(value: u64) -> Self {
        Self::new(value)
    }
}

impl From<LocalLogStorageChunkStart> for u64 {
    fn from(value: LocalLogStorageChunkStart) -> Self {
        value.get()
    }
}

impl FromStr for LocalLogStorageChunkStart {
    type Err = LocalLogStorageChunkStartParseError;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        if value.len() != LOCAL_LOG_STORAGE_CHUNK_START_DECIMAL_BYTES {
            return Err(LocalLogStorageChunkStartParseError::InvalidLength {
                actual_bytes: value.len(),
                expected_bytes: LOCAL_LOG_STORAGE_CHUNK_START_DECIMAL_BYTES,
            });
        }
        for (byte_index, character) in value.char_indices() {
            if !character.is_ascii_digit() {
                return Err(LocalLogStorageChunkStartParseError::InvalidDigit {
                    byte_index,
                    character,
                });
            }
        }
        value.parse::<u64>().map(Self).map_err(|_| LocalLogStorageChunkStartParseError::Overflow)
    }
}

impl TryFrom<&str> for LocalLogStorageChunkStart {
    type Error = LocalLogStorageChunkStartParseError;

    fn try_from(value: &str) -> Result<Self, Self::Error> {
        value.parse()
    }
}

impl TryFrom<String> for LocalLogStorageChunkStart {
    type Error = LocalLogStorageChunkStartParseError;

    fn try_from(value: String) -> Result<Self, Self::Error> {
        value.parse()
    }
}

#[cfg(test)]
mod tests {
    use super::{LOCAL_LOG_STORAGE_CHUNK_START_DECIMAL_BYTES, LocalLogStorageChunkStart};
    use crate::local_log::{
        LocalLogStorageChunkStartParseError, LocalLogStorageChunkStartParseErrorCode,
    };

    #[test]
    fn fixed_width_text_round_trips_complete_u64_boundaries()
    -> Result<(), Box<dyn std::error::Error>> {
        let zero = LocalLogStorageChunkStart::ZERO;
        let maximum = LocalLogStorageChunkStart::MAX;

        assert_eq!(zero.to_string(), "00000000000000000000");
        assert_eq!(maximum.to_string(), "18446744073709551615");
        assert_eq!(zero.to_string().len(), LOCAL_LOG_STORAGE_CHUNK_START_DECIMAL_BYTES);
        assert_eq!(maximum.to_string().parse::<LocalLogStorageChunkStart>()?, maximum);
        Ok(())
    }

    #[test]
    fn parsing_rejects_noncanonical_and_overflowing_text_in_fixed_precedence() {
        assert!(matches!(
            "0".parse::<LocalLogStorageChunkStart>(),
            Err(LocalLogStorageChunkStartParseError::InvalidLength { .. })
        ));
        assert!(matches!(
            "0000000000000000000x".parse::<LocalLogStorageChunkStart>(),
            Err(LocalLogStorageChunkStartParseError::InvalidDigit {
                byte_index: 19,
                character: 'x'
            })
        ));
        assert_eq!(
            "18446744073709551616".parse::<LocalLogStorageChunkStart>(),
            Err(LocalLogStorageChunkStartParseError::Overflow)
        );
        assert_eq!(
            LocalLogStorageChunkStartParseErrorCode::InvalidLength.as_str(),
            "local_log_storage_chunk_start_parse.invalid_length"
        );
    }
}

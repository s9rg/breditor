use std::{fmt, num::NonZeroU64, str::FromStr};

use super::{
    LocalLogStorageWriterEpochExhausted, LocalLogStorageWriterEpochParseError,
    LocalLogStorageWriterEpochValueError,
};

/// Maximum UTF-8 bytes in one canonical decimal storage writer epoch.
pub const MAX_LOCAL_LOG_STORAGE_WRITER_EPOCH_DECIMAL_BYTES: usize = 20;

/// Nonzero, nonwrapping epoch for one local-log storage scope's current writer.
///
/// A persisted scope control advances this value together with its current
/// [`super::LocalLogStorageFenceId`]. Equality is only one input to an exact
/// storage comparison: an epoch does not identify a scope, prove currentness,
/// or grant mutation authority on its own. It is nominally distinct from log
/// sequences, document revisions, and storage transaction identities.
///
/// Text uses the shortest unsigned ASCII decimal representation. Parsing
/// rejects empty, signed, whitespace-bearing, leading-zero, zero, nondecimal,
/// and overflowing representations rather than normalizing them.
///
/// Writer epochs cannot be substituted for local-log entry sequences:
///
/// ```compile_fail
/// fn expects_epoch(_: breditor_core::local_log::LocalLogStorageWriterEpoch) {}
/// expects_epoch(breditor_core::local_log::LocalLogSequence::FIRST);
/// ```
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct LocalLogStorageWriterEpoch(NonZeroU64);

impl LocalLogStorageWriterEpoch {
    /// The first valid writer epoch.
    pub const FIRST: Self = Self(NonZeroU64::MIN);

    /// The final representable writer epoch.
    pub const MAX: Self = Self(NonZeroU64::MAX);

    /// Creates a nonzero writer epoch.
    ///
    /// # Errors
    ///
    /// Returns [`LocalLogStorageWriterEpochValueError::Zero`] when `value` is
    /// zero.
    pub const fn try_new(value: u64) -> Result<Self, LocalLogStorageWriterEpochValueError> {
        match NonZeroU64::new(value) {
            Some(value) => Ok(Self(value)),
            None => Err(LocalLogStorageWriterEpochValueError::Zero),
        }
    }

    /// Returns the numeric writer epoch.
    #[must_use]
    pub const fn get(self) -> u64 {
        self.0.get()
    }

    /// Returns the next writer epoch without wrapping.
    ///
    /// # Errors
    ///
    /// Returns [`LocalLogStorageWriterEpochExhausted`] when this epoch is
    /// [`Self::MAX`].
    pub const fn successor(self) -> Result<Self, LocalLogStorageWriterEpochExhausted> {
        match self.0.checked_add(1) {
            Some(value) => Ok(Self(value)),
            None => Err(LocalLogStorageWriterEpochExhausted),
        }
    }
}

impl fmt::Display for LocalLogStorageWriterEpoch {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.get().fmt(formatter)
    }
}

impl TryFrom<u64> for LocalLogStorageWriterEpoch {
    type Error = LocalLogStorageWriterEpochValueError;

    fn try_from(value: u64) -> Result<Self, Self::Error> {
        Self::try_new(value)
    }
}

impl FromStr for LocalLogStorageWriterEpoch {
    type Err = LocalLogStorageWriterEpochParseError;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        if value.is_empty() {
            return Err(LocalLogStorageWriterEpochParseError::Empty);
        }
        if matches!(value.as_bytes().first(), Some(b'+' | b'-')) {
            return Err(LocalLogStorageWriterEpochParseError::Sign);
        }
        if value.len() > MAX_LOCAL_LOG_STORAGE_WRITER_EPOCH_DECIMAL_BYTES {
            return Err(LocalLogStorageWriterEpochParseError::Overflow);
        }
        for (byte_index, character) in value.char_indices() {
            if character.is_whitespace() {
                return Err(LocalLogStorageWriterEpochParseError::Whitespace { byte_index });
            }
            if !character.is_ascii_digit() {
                return Err(LocalLogStorageWriterEpochParseError::InvalidDigit {
                    byte_index,
                    character,
                });
            }
        }
        if value == "0" {
            return Err(LocalLogStorageWriterEpochParseError::Zero);
        }
        if value.starts_with('0') {
            return Err(LocalLogStorageWriterEpochParseError::LeadingZero);
        }

        let value =
            value.parse::<u64>().map_err(|_| LocalLogStorageWriterEpochParseError::Overflow)?;
        // The grammar and zero checks above prove the numeric value is nonzero.
        Self::try_new(value).map_err(|_| LocalLogStorageWriterEpochParseError::Zero)
    }
}

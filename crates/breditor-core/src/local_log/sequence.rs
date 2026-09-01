use std::{fmt, num::NonZeroU64};

use thiserror::Error;

/// One-based, session-global position of an ordered local-log entry.
///
/// A sequence belongs to a [`super::LocalSessionId`] and never resets when
/// compaction creates a new [`super::LocalLogId`] append generation. Numeric
/// zero represents no entry and remains represented as `None` at an empty-prefix
/// anchor; it cannot identify a log entry.
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct LocalLogSequence(NonZeroU64);

impl LocalLogSequence {
    /// The first valid local-log entry position.
    pub const FIRST: Self = Self(NonZeroU64::MIN);

    /// The final representable local-log entry position.
    pub const MAX: Self = Self(NonZeroU64::MAX);

    /// Creates a nonzero session-global sequence.
    ///
    /// # Errors
    ///
    /// Returns [`LocalLogSequenceError::Zero`] because zero represents an empty
    /// prefix rather than an entry.
    pub const fn try_new(value: u64) -> Result<Self, LocalLogSequenceError> {
        match NonZeroU64::new(value) {
            Some(value) => Ok(Self(value)),
            None => Err(LocalLogSequenceError::Zero),
        }
    }

    /// Returns the one-based sequence integer.
    #[must_use]
    pub const fn get(self) -> u64 {
        self.0.get()
    }

    /// Returns the checked next session-global sequence.
    ///
    /// # Errors
    ///
    /// Returns [`LocalLogSequenceError::Overflow`] after `u64::MAX`.
    pub const fn successor(self) -> Result<Self, LocalLogSequenceError> {
        match self.0.checked_add(1) {
            Some(value) => Ok(Self(value)),
            None => Err(LocalLogSequenceError::Overflow),
        }
    }
}

impl fmt::Display for LocalLogSequence {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.get().fmt(formatter)
    }
}

/// Why a local-log entry sequence cannot be represented.
#[non_exhaustive]
#[derive(Clone, Copy, Debug, Eq, Error, PartialEq)]
pub enum LocalLogSequenceError {
    /// Zero represents an empty prefix and cannot identify an entry.
    #[error("local-log sequence zero is reserved")]
    Zero,
    /// The session-global sequence reached `u64::MAX`.
    #[error("local-log sequence overflowed")]
    Overflow,
}

impl LocalLogSequenceError {
    /// Returns the stable namespaced error code.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Zero => "local_log_sequence.zero",
            Self::Overflow => "local_log_sequence.overflow",
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{LocalLogSequence, LocalLogSequenceError};

    #[test]
    fn sequences_are_one_based_and_checked() -> Result<(), LocalLogSequenceError> {
        assert_eq!(LocalLogSequence::try_new(0), Err(LocalLogSequenceError::Zero));
        assert_eq!(LocalLogSequence::FIRST.get(), 1);
        assert_eq!(LocalLogSequence::MAX.get(), u64::MAX);
        assert_eq!(LocalLogSequence::FIRST.successor()?.get(), 2);
        assert_eq!(LocalLogSequence::MAX.successor(), Err(LocalLogSequenceError::Overflow));
        assert_eq!(LocalLogSequenceError::Zero.as_str(), "local_log_sequence.zero");
        assert_eq!(LocalLogSequenceError::Overflow.as_str(), "local_log_sequence.overflow");
        Ok(())
    }
}

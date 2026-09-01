use thiserror::Error;

/// Default maximum number of retained entries in one complete linear history.
pub const DEFAULT_HISTORY_CAPACITY: u32 = 100;

/// Hard upper bound for retained entries in one linear history.
pub const MAX_HISTORY_CAPACITY: u32 = 10_000;

/// Fixed-width entry limit for one session's linear history.
///
/// The limit counts logical history entries, not operations or bytes. `0`
/// disables retention while leaving state publication available.
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct HistoryCapacity(u32);

impl HistoryCapacity {
    /// A capacity that retains no undo or redo entries.
    pub const DISABLED: Self = Self(0);

    /// Creates a bounded history capacity.
    ///
    /// # Errors
    ///
    /// Returns [`HistoryCapacityError::TooLarge`] above
    /// [`MAX_HISTORY_CAPACITY`].
    pub const fn try_new(value: u32) -> Result<Self, HistoryCapacityError> {
        if value > MAX_HISTORY_CAPACITY {
            return Err(HistoryCapacityError::TooLarge {
                actual: value,
                maximum: MAX_HISTORY_CAPACITY,
            });
        }
        Ok(Self(value))
    }

    /// Returns the configured entry limit.
    #[must_use]
    pub const fn get(self) -> u32 {
        self.0
    }

    pub(crate) fn as_usize(self) -> usize {
        // Every supported Rust target can represent the fixed maximum 10,000.
        self.0 as usize
    }
}

impl Default for HistoryCapacity {
    fn default() -> Self {
        Self(DEFAULT_HISTORY_CAPACITY)
    }
}

/// Why a requested history capacity is outside the fixed runtime contract.
#[derive(Clone, Copy, Debug, Eq, Error, PartialEq)]
pub enum HistoryCapacityError {
    /// The requested entry count exceeds the hard upper bound.
    #[error("history capacity is {actual}; the maximum is {maximum}")]
    TooLarge {
        /// Rejected entry count.
        actual: u32,
        /// Fixed maximum entry count.
        maximum: u32,
    },
}

use std::{fmt, num::NonZeroU32};

use super::BlockValueError;

/// Inclusive ordinal ceiling for the first positive, ascending list contract.
///
/// This is a deliberate domain limit, not a document-size allowance. The later
/// structural planner must also prove every resulting item ordinal fits it.
pub const MAX_ORDERED_LIST_ORDINAL: u32 = 2_147_483_647;

/// The first ordinal of an ascending ordered list.
///
/// The first structural contract uses positive numbering only. Zero, negative
/// numbering, reversed lists, and independent per-item values are not implied.
/// This value alone neither constructs nor admits a list in a document.
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct OrderedListStart(NonZeroU32);

impl OrderedListStart {
    /// Checks an explicit list start without truncation or fallback.
    ///
    /// # Errors
    ///
    /// Returns [`BlockValueError::OrderedListStartOutOfRange`] for zero or values
    /// greater than [`MAX_ORDERED_LIST_ORDINAL`].
    pub fn try_new(value: u32) -> Result<Self, BlockValueError> {
        NonZeroU32::new(value)
            .filter(|value| value.get() <= MAX_ORDERED_LIST_ORDINAL)
            .map(Self)
            .ok_or(BlockValueError::OrderedListStartOutOfRange)
    }

    /// Returns the conventional explicit start value of one.
    #[must_use]
    pub const fn one() -> Self {
        Self(NonZeroU32::MIN)
    }

    /// Returns the exact first ordinal.
    #[must_use]
    pub const fn get(self) -> u32 {
        self.0.get()
    }

    /// Computes one zero-based item's ordinal, rejecting overflow and the cap.
    ///
    /// No numbering wraps or saturates. A future structural operation must
    /// reject an unrepresentable result before publishing any document change.
    #[must_use]
    pub fn ordinal_at(self, item_index: u32) -> Option<u32> {
        self.get().checked_add(item_index).filter(|value| *value <= MAX_ORDERED_LIST_ORDINAL)
    }
}

impl fmt::Display for OrderedListStart {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.get().fmt(formatter)
    }
}

use std::{fmt, num::NonZeroU8};

use super::BlockValueError;

/// A semantic heading rank from one through six, independent of visual size.
///
/// This is a value, not proof that a schema admits heading elements. A heading
/// is a whole text block; its rank is not an inline format or font-size preset.
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct HeadingLevel(NonZeroU8);

impl HeadingLevel {
    /// Checks the full input before narrowing it to the six-level domain.
    ///
    /// # Errors
    ///
    /// Returns [`BlockValueError::HeadingLevelOutOfRange`] for zero or values
    /// greater than six; values are never clamped, wrapped, or defaulted.
    pub fn try_new(value: u32) -> Result<Self, BlockValueError> {
        let narrowed = u8::try_from(value)
            .ok()
            .filter(|value| *value <= 6)
            .and_then(NonZeroU8::new)
            .ok_or(BlockValueError::HeadingLevelOutOfRange)?;
        Ok(Self(narrowed))
    }

    /// Returns the exact semantic rank.
    #[must_use]
    pub const fn get(self) -> u8 {
        self.0.get()
    }
}

impl fmt::Display for HeadingLevel {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.get().fmt(formatter)
    }
}

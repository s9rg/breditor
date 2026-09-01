use thiserror::Error;

/// Largest aggregate text offset exactly representable by a JavaScript number.
pub const MAX_TEXT_OFFSET: u64 = 9_007_199_254_740_991;

/// A checked UTF-16 offset within one logical text container.
///
/// Unlike a [`crate::position::Point`] text offset, this value may span several
/// text leaves. The JavaScript-safe bound keeps a future Wasm record lossless.
#[derive(Clone, Copy, Debug, Default, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct TextOffset(u64);

impl TextOffset {
    /// The zero offset.
    pub const ZERO: Self = Self(0);

    /// Creates a checked aggregate offset.
    ///
    /// # Errors
    ///
    /// Returns [`TextOffsetError::TooLarge`] when `value` cannot be represented
    /// exactly by the future JavaScript boundary.
    pub const fn try_new(value: u64) -> Result<Self, TextOffsetError> {
        if value > MAX_TEXT_OFFSET {
            return Err(TextOffsetError::TooLarge { value, maximum: MAX_TEXT_OFFSET });
        }
        Ok(Self(value))
    }

    /// Returns the UTF-16 code-unit offset.
    #[must_use]
    pub const fn get(self) -> u64 {
        self.0
    }

    pub(crate) fn checked_add(self, value: u64) -> Result<Self, TextOffsetError> {
        let Some(result) = self.0.checked_add(value) else {
            return Err(TextOffsetError::Overflow);
        };
        Self::try_new(result)
    }
}

impl From<u32> for TextOffset {
    fn from(value: u32) -> Self {
        Self(u64::from(value))
    }
}

/// Why an aggregate text offset could not be represented.
#[derive(Clone, Copy, Debug, Eq, Error, PartialEq)]
pub enum TextOffsetError {
    /// Checked arithmetic exceeded `u64`.
    #[error("text-offset arithmetic overflowed")]
    Overflow,
    /// The value exceeds the JavaScript-safe protocol maximum.
    #[error("text offset {value} exceeds the protocol maximum {maximum}")]
    TooLarge {
        /// Rejected value.
        value: u64,
        /// Largest accepted value.
        maximum: u64,
    },
}

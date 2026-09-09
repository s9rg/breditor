use crate::document::{MAX_SAFE_INTEGER, MIN_SAFE_INTEGER, PropertyInteger};

use super::{InlineFormatPropertyTypeV1Error, MAX_INLINE_FORMAT_PROPERTY_STRING_BYTES};

/// Closed deterministic value domain for one inline-format property.
///
/// V1 deliberately excludes null, floats, arrays, objects, unions, enums,
/// regular expressions, defaults, coercion, and executable validation hooks.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum InlineFormatPropertyTypeV1 {
    /// An exact Boolean value.
    Boolean,
    /// A JavaScript-safe integer, optionally constrained by inclusive bounds.
    Integer(InlineFormatPropertyIntegerTypeV1),
    /// A Unicode string constrained by its exact UTF-8 byte length.
    String(InlineFormatPropertyStringTypeV1),
}

impl InlineFormatPropertyTypeV1 {
    /// Creates an unconstrained Boolean domain.
    #[must_use]
    pub const fn boolean() -> Self {
        Self::Boolean
    }

    /// Creates a checked JavaScript-safe integer domain.
    ///
    /// # Errors
    ///
    /// Returns [`InlineFormatPropertyTypeV1Error::InvalidIntegerRange`] when
    /// both bounds are present and the minimum exceeds the maximum.
    pub const fn try_integer(
        minimum: Option<PropertyInteger>,
        maximum: Option<PropertyInteger>,
    ) -> Result<Self, InlineFormatPropertyTypeV1Error> {
        let minimum = match minimum {
            Some(value) if value.get() == MIN_SAFE_INTEGER => None,
            value => value,
        };
        let maximum = match maximum {
            Some(value) if value.get() == MAX_SAFE_INTEGER => None,
            value => value,
        };
        match (minimum, maximum) {
            (Some(minimum), Some(maximum)) if minimum.get() > maximum.get() => {
                Err(InlineFormatPropertyTypeV1Error::InvalidIntegerRange { minimum, maximum })
            }
            _ => Ok(Self::Integer(InlineFormatPropertyIntegerTypeV1 { minimum, maximum })),
        }
    }

    /// Creates a checked UTF-8 string byte-length domain.
    ///
    /// # Errors
    ///
    /// Returns [`InlineFormatPropertyTypeV1Error`] when the range is reversed
    /// or exceeds [`MAX_INLINE_FORMAT_PROPERTY_STRING_BYTES`].
    pub const fn try_string(
        minimum_utf8_bytes: u32,
        maximum_utf8_bytes: u32,
    ) -> Result<Self, InlineFormatPropertyTypeV1Error> {
        if minimum_utf8_bytes > maximum_utf8_bytes {
            return Err(InlineFormatPropertyTypeV1Error::InvalidStringByteRange {
                minimum_utf8_bytes,
                maximum_utf8_bytes,
            });
        }
        if maximum_utf8_bytes > MAX_INLINE_FORMAT_PROPERTY_STRING_BYTES {
            return Err(InlineFormatPropertyTypeV1Error::StringMaximumTooLarge {
                actual: maximum_utf8_bytes,
                maximum: MAX_INLINE_FORMAT_PROPERTY_STRING_BYTES,
            });
        }
        Ok(Self::String(InlineFormatPropertyStringTypeV1 {
            minimum_utf8_bytes,
            maximum_utf8_bytes,
        }))
    }
}

/// Checked inclusive bounds for a JavaScript-safe integer property.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct InlineFormatPropertyIntegerTypeV1 {
    minimum: Option<PropertyInteger>,
    maximum: Option<PropertyInteger>,
}

impl InlineFormatPropertyIntegerTypeV1 {
    /// Returns the inclusive lower bound, if any.
    #[must_use]
    pub const fn minimum(&self) -> Option<PropertyInteger> {
        self.minimum
    }

    /// Returns the inclusive upper bound, if any.
    #[must_use]
    pub const fn maximum(&self) -> Option<PropertyInteger> {
        self.maximum
    }
}

/// Checked inclusive UTF-8 byte-length bounds for a string property.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct InlineFormatPropertyStringTypeV1 {
    minimum_utf8_bytes: u32,
    maximum_utf8_bytes: u32,
}

impl InlineFormatPropertyStringTypeV1 {
    /// Returns the inclusive minimum UTF-8 byte length.
    #[must_use]
    pub const fn minimum_utf8_bytes(&self) -> u32 {
        self.minimum_utf8_bytes
    }

    /// Returns the inclusive maximum UTF-8 byte length.
    #[must_use]
    pub const fn maximum_utf8_bytes(&self) -> u32 {
        self.maximum_utf8_bytes
    }
}

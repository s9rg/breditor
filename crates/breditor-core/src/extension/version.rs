use std::{fmt, num::NonZeroU32};

use super::ExtensionVersionError;

/// A nonzero developer-assigned version of one extension manifest.
///
/// Versions are compared exactly. The numeric value does not imply semantic-
/// version ranges, ordering compatibility, schema compatibility, or
/// persistence compatibility.
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct ExtensionVersion(NonZeroU32);

impl ExtensionVersion {
    /// Creates an extension version.
    ///
    /// # Errors
    ///
    /// Returns [`ExtensionVersionError::Zero`] because version zero is
    /// reserved and cannot identify a published manifest contract.
    pub fn try_new(value: u32) -> Result<Self, ExtensionVersionError> {
        NonZeroU32::new(value).map(Self).ok_or(ExtensionVersionError::Zero)
    }

    /// Returns the first valid extension version.
    #[must_use]
    pub const fn one() -> Self {
        Self(NonZeroU32::MIN)
    }

    /// Returns the numeric extension version.
    #[must_use]
    pub const fn get(self) -> u32 {
        self.0.get()
    }
}

impl fmt::Display for ExtensionVersion {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.get().fmt(formatter)
    }
}

#[cfg(test)]
mod tests {
    use super::{ExtensionVersion, ExtensionVersionError};

    #[test]
    fn zero_is_reserved() {
        assert_eq!(ExtensionVersion::try_new(0), Err(ExtensionVersionError::Zero));
    }

    #[test]
    fn versions_are_exact_ordered_values() -> Result<(), ExtensionVersionError> {
        let one = ExtensionVersion::one();
        let two = ExtensionVersion::try_new(2)?;

        assert_eq!(one.get(), 1);
        assert!(one < two);
        assert_eq!(two.to_string(), "2");
        Ok(())
    }
}

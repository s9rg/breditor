use std::{fmt, num::NonZeroU32};

use thiserror::Error;

/// The nonzero persisted revision of one semantic schema type.
///
/// A type revision belongs to one node or inline-format declaration. It is
/// deliberately distinct from an extension manifest version, a schema
/// version, and a package version. Changing it changes the compiled schema
/// fingerprint even when every qualified identity stays the same.
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct PersistedTypeRevision(NonZeroU32);

impl PersistedTypeRevision {
    /// Creates a persisted type revision.
    ///
    /// # Errors
    ///
    /// Returns [`PersistedTypeRevisionError::Zero`] because revision zero is
    /// reserved and cannot identify persisted semantic meaning.
    pub fn try_new(value: u32) -> Result<Self, PersistedTypeRevisionError> {
        NonZeroU32::new(value).map(Self).ok_or(PersistedTypeRevisionError::Zero)
    }

    /// Returns the first valid persisted type revision.
    #[must_use]
    pub const fn one() -> Self {
        Self(NonZeroU32::MIN)
    }

    /// Returns the numeric persisted type revision.
    #[must_use]
    pub const fn get(self) -> u32 {
        self.0.get()
    }
}

impl fmt::Display for PersistedTypeRevision {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.get().fmt(formatter)
    }
}

/// Why a [`PersistedTypeRevision`] could not be created.
#[derive(Clone, Copy, Debug, Eq, Error, PartialEq)]
pub enum PersistedTypeRevisionError {
    /// Revision zero is reserved and never identifies persisted type meaning.
    #[error("persisted type revision zero is reserved")]
    Zero,
}

#[cfg(test)]
mod tests {
    use super::{PersistedTypeRevision, PersistedTypeRevisionError};

    #[test]
    fn zero_is_reserved() {
        assert_eq!(PersistedTypeRevision::try_new(0), Err(PersistedTypeRevisionError::Zero));
    }

    #[test]
    fn revisions_are_exact_ordered_values() -> Result<(), PersistedTypeRevisionError> {
        let one = PersistedTypeRevision::one();
        let seven = PersistedTypeRevision::try_new(7)?;

        assert_eq!(one.get(), 1);
        assert!(one < seven);
        assert_eq!(seven.to_string(), "7");
        Ok(())
    }
}

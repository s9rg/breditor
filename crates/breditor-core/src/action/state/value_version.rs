use std::{fmt, num::NonZeroU32};

use thiserror::Error;

/// Nonzero semantic version of one action-state value contract.
///
/// This version is intentionally independent from action-input, document,
/// schema, and persistence versions. Equal numbers across those protocols have
/// no implied relationship.
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct ActionStateValueVersion(NonZeroU32);

impl ActionStateValueVersion {
    /// Creates a nonzero action-state value version.
    ///
    /// # Errors
    ///
    /// Returns [`ActionStateValueVersionError::Zero`] because zero cannot
    /// identify a published output contract.
    pub fn try_new(value: u32) -> Result<Self, ActionStateValueVersionError> {
        NonZeroU32::new(value).map(Self).ok_or(ActionStateValueVersionError::Zero)
    }

    /// Returns the first valid action-state value version.
    #[must_use]
    pub const fn one() -> Self {
        Self(NonZeroU32::MIN)
    }

    /// Returns the numeric version.
    #[must_use]
    pub const fn get(self) -> u32 {
        self.0.get()
    }
}

impl fmt::Display for ActionStateValueVersion {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.get().fmt(formatter)
    }
}

/// Why a numeric action-state value version is invalid.
#[derive(Clone, Copy, Debug, Eq, Error, PartialEq)]
pub enum ActionStateValueVersionError {
    /// Version zero is permanently reserved.
    #[error("action-state value version zero is reserved")]
    Zero,
}

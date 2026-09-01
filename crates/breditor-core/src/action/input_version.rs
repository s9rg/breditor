use std::{fmt, num::NonZeroU32};

use thiserror::Error;

/// Nonzero semantic version of one action-input contract.
///
/// This is intentionally distinct from document schema versions: input and
/// schema contracts may evolve independently even when their numeric values
/// happen to match.
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct ActionInputVersion(NonZeroU32);

impl ActionInputVersion {
    /// Creates a nonzero action-input version.
    ///
    /// # Errors
    ///
    /// Returns [`ActionInputVersionError::Zero`] because version zero is
    /// reserved and cannot identify a published input contract.
    pub fn try_new(value: u32) -> Result<Self, ActionInputVersionError> {
        NonZeroU32::new(value).map(Self).ok_or(ActionInputVersionError::Zero)
    }

    /// Returns the first valid action-input version.
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

impl fmt::Display for ActionInputVersion {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.get().fmt(formatter)
    }
}

/// Why a numeric action-input version is invalid.
#[derive(Clone, Copy, Debug, Eq, Error, PartialEq)]
pub enum ActionInputVersionError {
    /// Version zero is permanently reserved.
    #[error("action-input version zero is reserved")]
    Zero,
}

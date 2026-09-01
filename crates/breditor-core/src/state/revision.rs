use thiserror::Error;

/// Monotonic revision within one [`crate::state::LineageId`].
#[derive(Clone, Copy, Debug, Default, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct Revision(u64);

impl Revision {
    /// The initial revision.
    pub const ZERO: Self = Self(0);

    /// Creates a revision from its protocol integer.
    #[must_use]
    pub const fn new(value: u64) -> Self {
        Self(value)
    }

    /// Returns the protocol integer.
    #[must_use]
    pub const fn get(self) -> u64 {
        self.0
    }

    /// Returns the checked next revision.
    ///
    /// # Errors
    ///
    /// Returns [`RevisionError::Overflow`] at `u64::MAX`.
    pub const fn successor(self) -> Result<Self, RevisionError> {
        match self.0.checked_add(1) {
            Some(value) => Ok(Self(value)),
            None => Err(RevisionError::Overflow),
        }
    }
}

/// Why a revision transition cannot be represented.
#[derive(Clone, Copy, Debug, Eq, Error, PartialEq)]
pub enum RevisionError {
    /// The monotonic counter reached `u64::MAX`.
    #[error("editor-state revision overflowed")]
    Overflow,
}

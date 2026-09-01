use std::{fmt, num::NonZeroU32};

use thiserror::Error;

use crate::identity::QualifiedName;

/// A nonzero semantic version of a compiled schema definition.
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct SchemaVersion(NonZeroU32);

impl SchemaVersion {
    /// Creates a schema version.
    ///
    /// # Errors
    ///
    /// Returns [`SchemaVersionError::Zero`] because version zero is reserved.
    pub fn try_new(value: u32) -> Result<Self, SchemaVersionError> {
        NonZeroU32::new(value).map(Self).ok_or(SchemaVersionError::Zero)
    }

    /// Returns the numeric schema version.
    #[must_use]
    pub const fn get(self) -> u32 {
        self.0.get()
    }

    pub(crate) const fn one() -> Self {
        Self(NonZeroU32::MIN)
    }
}

impl fmt::Display for SchemaVersion {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.get().fmt(formatter)
    }
}

/// Why a [`SchemaVersion`] could not be created.
#[derive(Clone, Copy, Debug, Eq, Error, PartialEq)]
pub enum SchemaVersionError {
    /// Version zero is reserved and never identifies a schema.
    #[error("schema version zero is reserved")]
    Zero,
}

/// The persisted migration identity of a compiled schema.
#[derive(Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct SchemaId {
    name: QualifiedName,
    version: SchemaVersion,
}

impl SchemaId {
    /// Creates a schema identity from validated components.
    #[must_use]
    pub const fn new(name: QualifiedName, version: SchemaVersion) -> Self {
        Self { name, version }
    }

    /// Returns the qualified schema name.
    #[must_use]
    pub const fn name(&self) -> &QualifiedName {
        &self.name
    }

    /// Returns the schema version.
    #[must_use]
    pub const fn version(&self) -> SchemaVersion {
        self.version
    }
}

impl fmt::Display for SchemaId {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(formatter, "{}@{}", self.name, self.version)
    }
}

use std::fmt;

use crate::identity::QualifiedName;

use super::ActionStateValueVersion;

/// Stable versioned identity of one action-state output value.
#[derive(Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct ActionStateValueContract {
    name: QualifiedName,
    version: ActionStateValueVersion,
}

impl ActionStateValueContract {
    /// Creates an output contract from a validated name and independent version.
    #[must_use]
    pub const fn new(name: QualifiedName, version: ActionStateValueVersion) -> Self {
        Self { name, version }
    }

    /// Returns the namespaced output contract name.
    #[must_use]
    pub const fn name(&self) -> &QualifiedName {
        &self.name
    }

    /// Returns the output contract version.
    #[must_use]
    pub const fn version(&self) -> ActionStateValueVersion {
        self.version
    }
}

impl fmt::Display for ActionStateValueContract {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(formatter, "{}@{}", self.name, self.version)
    }
}

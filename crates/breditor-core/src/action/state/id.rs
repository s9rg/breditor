use std::fmt;

use crate::identity::{QualifiedName, QualifiedNameError};

/// Stable namespaced identity of one observable editor control.
///
/// This identity deliberately differs from action, intent, and binding IDs. A
/// host may expose several controls backed by one invocation, or one control
/// whose source changes in a later catalog version, without conflating command
/// identity with presentation-state identity.
#[derive(Clone, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct ActionStateId(QualifiedName);

impl ActionStateId {
    /// Validates and creates an observable-state identity.
    ///
    /// # Errors
    ///
    /// Returns [`QualifiedNameError`] when `value` is not a valid namespaced
    /// identifier.
    pub fn try_new(value: impl AsRef<str>) -> Result<Self, QualifiedNameError> {
        QualifiedName::try_new(value).map(Self)
    }

    /// Creates an identity from an already validated qualified name.
    #[must_use]
    pub const fn from_qualified_name(name: QualifiedName) -> Self {
        Self(name)
    }

    /// Returns the underlying qualified name.
    #[must_use]
    pub const fn qualified_name(&self) -> &QualifiedName {
        &self.0
    }

    /// Returns the complete namespaced state name.
    #[must_use]
    pub fn as_str(&self) -> &str {
        self.0.as_str()
    }

    /// Consumes the identity and returns its qualified name.
    #[must_use]
    pub fn into_qualified_name(self) -> QualifiedName {
        self.0
    }
}

impl fmt::Debug for ActionStateId {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.debug_tuple("ActionStateId").field(&self.as_str()).finish()
    }
}

impl fmt::Display for ActionStateId {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(self.as_str())
    }
}

impl From<QualifiedName> for ActionStateId {
    fn from(value: QualifiedName) -> Self {
        Self::from_qualified_name(value)
    }
}

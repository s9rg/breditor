use std::fmt;

use crate::identity::{QualifiedName, QualifiedNameError};

/// Stable namespaced identity of one intent-to-action binding.
///
/// A binding identity exists for deterministic registration and diagnostics. It
/// is not a toolbar-control identity and does not enter transaction replay.
#[derive(Clone, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct BindingId(QualifiedName);

impl BindingId {
    /// Validates and creates a binding identity.
    ///
    /// # Errors
    ///
    /// Returns [`QualifiedNameError`] when `value` is not a valid namespaced
    /// identifier.
    pub fn try_new(value: impl AsRef<str>) -> Result<Self, QualifiedNameError> {
        QualifiedName::try_new(value).map(Self)
    }

    /// Creates a binding identity from an already validated qualified name.
    #[must_use]
    pub const fn from_qualified_name(name: QualifiedName) -> Self {
        Self(name)
    }

    /// Returns the underlying qualified name.
    #[must_use]
    pub const fn qualified_name(&self) -> &QualifiedName {
        &self.0
    }

    /// Returns the complete namespaced binding name.
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

impl fmt::Debug for BindingId {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.debug_tuple("BindingId").field(&self.as_str()).finish()
    }
}

impl fmt::Display for BindingId {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(self.as_str())
    }
}

impl From<QualifiedName> for BindingId {
    fn from(value: QualifiedName) -> Self {
        Self::from_qualified_name(value)
    }
}

use std::fmt;

use crate::identity::{QualifiedName, QualifiedNameError};

/// Stable namespaced identity of one host-normalized semantic intent.
///
/// An intent describes editor meaning such as "insert a paragraph", not a DOM
/// event, key chord, toolbar control, or platform-specific gesture.
#[derive(Clone, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct IntentId(QualifiedName);

impl IntentId {
    /// Validates and creates an intent identity.
    ///
    /// # Errors
    ///
    /// Returns [`QualifiedNameError`] when `value` is not a valid namespaced
    /// identifier.
    pub fn try_new(value: impl AsRef<str>) -> Result<Self, QualifiedNameError> {
        QualifiedName::try_new(value).map(Self)
    }

    /// Creates an intent identity from an already validated qualified name.
    #[must_use]
    pub const fn from_qualified_name(name: QualifiedName) -> Self {
        Self(name)
    }

    /// Returns the underlying qualified name.
    #[must_use]
    pub const fn qualified_name(&self) -> &QualifiedName {
        &self.0
    }

    /// Returns the complete namespaced intent name.
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

impl fmt::Debug for IntentId {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.debug_tuple("IntentId").field(&self.as_str()).finish()
    }
}

impl fmt::Display for IntentId {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(self.as_str())
    }
}

impl From<QualifiedName> for IntentId {
    fn from(value: QualifiedName) -> Self {
        Self::from_qualified_name(value)
    }
}

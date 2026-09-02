use std::{fmt, str::FromStr, sync::Arc};

use super::identity::{LocalLogIdentityError, validate_local_log_identity};

/// Caller-supplied identity of one local-log storage scope.
///
/// A storage profile associates one authoritative manifest/head with this
/// opaque scope. Equality does not authenticate the scope or grant access to
/// its storage.
#[derive(Clone, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct LocalLogStorageScopeId(Arc<str>);

impl LocalLogStorageScopeId {
    /// Validates and creates a storage-scope identity.
    ///
    /// The exact grammar is `[A-Za-z0-9][A-Za-z0-9._:-]{0,127}`.
    ///
    /// # Errors
    ///
    /// Returns [`LocalLogIdentityError`] when `value` is empty, oversized, or
    /// outside the portable ASCII grammar.
    pub fn try_new(value: impl AsRef<str>) -> Result<Self, LocalLogIdentityError> {
        let value = value.as_ref();
        validate_local_log_identity(value)?;
        Ok(Self(Arc::from(value)))
    }

    /// Returns the exact caller-supplied identity.
    #[must_use]
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl AsRef<str> for LocalLogStorageScopeId {
    fn as_ref(&self) -> &str {
        self.as_str()
    }
}

impl fmt::Debug for LocalLogStorageScopeId {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.debug_tuple("LocalLogStorageScopeId").field(&self.as_str()).finish()
    }
}

impl fmt::Display for LocalLogStorageScopeId {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(self.as_str())
    }
}

impl FromStr for LocalLogStorageScopeId {
    type Err = LocalLogIdentityError;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        Self::try_new(value)
    }
}

impl TryFrom<String> for LocalLogStorageScopeId {
    type Error = LocalLogIdentityError;

    fn try_from(value: String) -> Result<Self, Self::Error> {
        validate_local_log_identity(&value)?;
        Ok(Self(Arc::from(value)))
    }
}

#[cfg(test)]
mod tests {
    use super::LocalLogStorageScopeId;
    use crate::local_log::LocalLogIdentityError;

    #[test]
    fn scope_identity_is_owned_and_portable() -> Result<(), LocalLogIdentityError> {
        let source = String::from("scope:document-7");
        let identity = LocalLogStorageScopeId::try_new(&source)?;
        drop(source);

        assert_eq!(identity.as_str(), "scope:document-7");
        assert_eq!(identity, identity.clone());
        assert_eq!(identity.to_string(), "scope:document-7");
        Ok(())
    }

    #[test]
    fn scope_identity_rejects_the_wrong_grammar() {
        assert!(LocalLogStorageScopeId::try_new("scope/document").is_err());
    }
}

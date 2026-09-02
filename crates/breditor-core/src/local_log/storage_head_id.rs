use std::{fmt, str::FromStr, sync::Arc};

use super::identity::{LocalLogIdentityError, validate_local_log_identity};

/// Caller-supplied identity of one authoritative local-log storage head.
///
/// Head identities are opaque: their syntax conveys no numeric, lexical,
/// temporal, or generation ordering. This type cannot prove lifetime
/// uniqueness within a storage scope.
#[derive(Clone, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct LocalLogStorageHeadId(Arc<str>);

impl LocalLogStorageHeadId {
    /// Validates and creates a storage-head identity.
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

impl AsRef<str> for LocalLogStorageHeadId {
    fn as_ref(&self) -> &str {
        self.as_str()
    }
}

impl fmt::Debug for LocalLogStorageHeadId {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.debug_tuple("LocalLogStorageHeadId").field(&self.as_str()).finish()
    }
}

impl fmt::Display for LocalLogStorageHeadId {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(self.as_str())
    }
}

impl FromStr for LocalLogStorageHeadId {
    type Err = LocalLogIdentityError;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        Self::try_new(value)
    }
}

impl TryFrom<String> for LocalLogStorageHeadId {
    type Error = LocalLogIdentityError;

    fn try_from(value: String) -> Result<Self, Self::Error> {
        validate_local_log_identity(&value)?;
        Ok(Self(Arc::from(value)))
    }
}

#[cfg(test)]
mod tests {
    use super::LocalLogStorageHeadId;
    use crate::local_log::LocalLogIdentityError;

    #[test]
    fn head_identity_is_owned_and_portable() -> Result<(), LocalLogIdentityError> {
        let source = String::from("head:opaque-10");
        let identity = LocalLogStorageHeadId::try_new(&source)?;
        drop(source);

        assert_eq!(identity.as_str(), "head:opaque-10");
        assert_eq!(identity, identity.clone());
        assert_eq!(identity.to_string(), "head:opaque-10");
        Ok(())
    }

    #[test]
    fn head_identity_rejects_the_wrong_grammar() {
        assert!(LocalLogStorageHeadId::try_new(":head").is_err());
    }
}

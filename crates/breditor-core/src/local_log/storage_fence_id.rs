use std::{fmt, str::FromStr, sync::Arc};

use super::identity::{LocalLogIdentityError, validate_local_log_identity};

/// Caller-supplied correlation identity for a local-log writer fence.
///
/// A fence ID is explicitly non-secret and is not a writer capability. Its
/// reconstruction, cloning, or equality never authorizes a storage operation
/// or proves that a separately held capability is current.
#[derive(Clone, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct LocalLogStorageFenceId(Arc<str>);

impl LocalLogStorageFenceId {
    /// Validates and creates a storage-fence identity.
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

    /// Returns the exact caller-supplied non-secret identity.
    #[must_use]
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl AsRef<str> for LocalLogStorageFenceId {
    fn as_ref(&self) -> &str {
        self.as_str()
    }
}

impl fmt::Debug for LocalLogStorageFenceId {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.debug_tuple("LocalLogStorageFenceId").field(&self.as_str()).finish()
    }
}

impl fmt::Display for LocalLogStorageFenceId {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(self.as_str())
    }
}

impl FromStr for LocalLogStorageFenceId {
    type Err = LocalLogIdentityError;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        Self::try_new(value)
    }
}

impl TryFrom<String> for LocalLogStorageFenceId {
    type Error = LocalLogIdentityError;

    fn try_from(value: String) -> Result<Self, Self::Error> {
        validate_local_log_identity(&value)?;
        Ok(Self(Arc::from(value)))
    }
}

#[cfg(test)]
mod tests {
    use super::LocalLogStorageFenceId;
    use crate::local_log::LocalLogIdentityError;

    #[test]
    fn fence_identity_is_owned_and_portable() -> Result<(), LocalLogIdentityError> {
        let source = String::from("fence:writer-epoch");
        let identity = LocalLogStorageFenceId::try_new(&source)?;
        drop(source);

        assert_eq!(identity.as_str(), "fence:writer-epoch");
        assert_eq!(identity, identity.clone());
        assert_eq!(identity.to_string(), "fence:writer-epoch");
        Ok(())
    }

    #[test]
    fn fence_identity_rejects_the_wrong_grammar() {
        assert!(LocalLogStorageFenceId::try_new("fence=epoch").is_err());
    }
}

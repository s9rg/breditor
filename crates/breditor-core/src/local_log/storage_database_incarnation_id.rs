use std::{fmt, str::FromStr, sync::Arc};

use super::identity::{LocalLogIdentityError, validate_local_log_identity};

/// Caller-supplied identity of one local-log profile database incarnation.
///
/// The value is opaque and non-secret. Its syntax proves neither freshness nor
/// entropy; the storage profile must ensure lifetime freshness for each
/// physical profile-database establishment.
#[derive(Clone, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct LocalLogStorageDatabaseIncarnationId(Arc<str>);

impl LocalLogStorageDatabaseIncarnationId {
    /// Validates and creates a storage-database-incarnation identity.
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

impl AsRef<str> for LocalLogStorageDatabaseIncarnationId {
    fn as_ref(&self) -> &str {
        self.as_str()
    }
}

impl fmt::Debug for LocalLogStorageDatabaseIncarnationId {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.debug_tuple("LocalLogStorageDatabaseIncarnationId").field(&self.as_str()).finish()
    }
}

impl fmt::Display for LocalLogStorageDatabaseIncarnationId {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(self.as_str())
    }
}

impl FromStr for LocalLogStorageDatabaseIncarnationId {
    type Err = LocalLogIdentityError;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        Self::try_new(value)
    }
}

impl TryFrom<String> for LocalLogStorageDatabaseIncarnationId {
    type Error = LocalLogIdentityError;

    fn try_from(value: String) -> Result<Self, Self::Error> {
        validate_local_log_identity(&value)?;
        Ok(Self(Arc::from(value)))
    }
}

#[cfg(test)]
mod tests {
    use std::{any::TypeId, hash::Hash};

    use super::LocalLogStorageDatabaseIncarnationId;
    use crate::local_log::{
        LocalLogIdentityError, LocalLogStorageScopeIncarnationId, MAX_LOCAL_LOG_IDENTITY_BYTES,
    };

    fn assert_value_traits<T: Clone + Eq + Hash + Ord>() {}

    #[test]
    fn database_incarnation_identity_is_owned_and_exposes_value_semantics()
    -> Result<(), LocalLogIdentityError> {
        assert_value_traits::<LocalLogStorageDatabaseIncarnationId>();

        let source = String::from("database:installation-7");
        let identity = LocalLogStorageDatabaseIncarnationId::try_new(&source)?;
        drop(source);

        assert_eq!(identity.as_str(), "database:installation-7");
        assert_eq!(identity.as_ref(), "database:installation-7");
        assert_eq!(identity, identity.clone());
        assert_eq!(identity.to_string(), "database:installation-7");
        assert_eq!(
            format!("{identity:?}"),
            "LocalLogStorageDatabaseIncarnationId(\"database:installation-7\")"
        );
        assert_eq!("database:installation-7".parse(), Ok(identity.clone()));
        assert_eq!(
            LocalLogStorageDatabaseIncarnationId::try_from(String::from("database:installation-7")),
            Ok(identity)
        );
        Ok(())
    }

    #[test]
    fn database_incarnation_identity_accepts_the_exact_grammar_and_byte_limit()
    -> Result<(), LocalLogIdentityError> {
        assert_eq!(LocalLogStorageDatabaseIncarnationId::try_new("A0._:-z9")?.as_str(), "A0._:-z9");

        let maximum = "a".repeat(MAX_LOCAL_LOG_IDENTITY_BYTES);
        assert_eq!(LocalLogStorageDatabaseIncarnationId::try_new(&maximum)?.as_str(), maximum);
        Ok(())
    }

    #[test]
    fn database_incarnation_identity_rejects_every_grammar_boundary() {
        assert_eq!(
            LocalLogStorageDatabaseIncarnationId::try_new(""),
            Err(LocalLogIdentityError::Empty)
        );
        assert_eq!(
            LocalLogStorageDatabaseIncarnationId::try_new(
                "a".repeat(MAX_LOCAL_LOG_IDENTITY_BYTES + 1)
            ),
            Err(LocalLogIdentityError::TooLong {
                actual: MAX_LOCAL_LOG_IDENTITY_BYTES + 1,
                maximum: MAX_LOCAL_LOG_IDENTITY_BYTES,
            })
        );
        assert_eq!(
            LocalLogStorageDatabaseIncarnationId::try_new(":database"),
            Err(LocalLogIdentityError::InvalidStart)
        );
        assert_eq!(
            LocalLogStorageDatabaseIncarnationId::try_new("database/incarnation"),
            Err(LocalLogIdentityError::InvalidCharacter { byte_index: 8, character: '/' })
        );
        assert_eq!(
            LocalLogStorageDatabaseIncarnationId::try_new("database-é"),
            Err(LocalLogIdentityError::InvalidCharacter { byte_index: 9, character: 'é' })
        );
    }

    #[test]
    fn database_and_scope_incarnation_types_are_not_interchangeable() {
        assert_ne!(
            TypeId::of::<LocalLogStorageDatabaseIncarnationId>(),
            TypeId::of::<LocalLogStorageScopeIncarnationId>()
        );
    }
}

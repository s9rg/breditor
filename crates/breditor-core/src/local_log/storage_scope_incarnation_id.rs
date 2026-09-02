use std::{fmt, str::FromStr, sync::Arc};

use super::identity::{LocalLogIdentityError, validate_local_log_identity};

/// Caller-supplied identity of one local-log storage-scope incarnation.
///
/// The value is opaque and non-secret. Its syntax proves neither freshness nor
/// entropy; the storage profile must ensure lifetime freshness within one
/// database incarnation and must not share it between scope lifetimes.
#[derive(Clone, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct LocalLogStorageScopeIncarnationId(Arc<str>);

impl LocalLogStorageScopeIncarnationId {
    /// Validates and creates a storage-scope-incarnation identity.
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

impl AsRef<str> for LocalLogStorageScopeIncarnationId {
    fn as_ref(&self) -> &str {
        self.as_str()
    }
}

impl fmt::Debug for LocalLogStorageScopeIncarnationId {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.debug_tuple("LocalLogStorageScopeIncarnationId").field(&self.as_str()).finish()
    }
}

impl fmt::Display for LocalLogStorageScopeIncarnationId {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(self.as_str())
    }
}

impl FromStr for LocalLogStorageScopeIncarnationId {
    type Err = LocalLogIdentityError;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        Self::try_new(value)
    }
}

impl TryFrom<String> for LocalLogStorageScopeIncarnationId {
    type Error = LocalLogIdentityError;

    fn try_from(value: String) -> Result<Self, Self::Error> {
        validate_local_log_identity(&value)?;
        Ok(Self(Arc::from(value)))
    }
}

#[cfg(test)]
mod tests {
    use std::hash::Hash;

    use super::LocalLogStorageScopeIncarnationId;
    use crate::local_log::{LocalLogIdentityError, MAX_LOCAL_LOG_IDENTITY_BYTES};

    fn assert_value_traits<T: Clone + Eq + Hash + Ord>() {}

    #[test]
    fn scope_incarnation_identity_is_owned_and_exposes_value_semantics()
    -> Result<(), LocalLogIdentityError> {
        assert_value_traits::<LocalLogStorageScopeIncarnationId>();

        let source = String::from("scope-incarnation:document-7");
        let identity = LocalLogStorageScopeIncarnationId::try_new(&source)?;
        drop(source);

        assert_eq!(identity.as_str(), "scope-incarnation:document-7");
        assert_eq!(identity.as_ref(), "scope-incarnation:document-7");
        assert_eq!(identity, identity.clone());
        assert_eq!(identity.to_string(), "scope-incarnation:document-7");
        assert_eq!(
            format!("{identity:?}"),
            "LocalLogStorageScopeIncarnationId(\"scope-incarnation:document-7\")"
        );
        assert_eq!("scope-incarnation:document-7".parse(), Ok(identity.clone()));
        assert_eq!(
            LocalLogStorageScopeIncarnationId::try_from(String::from(
                "scope-incarnation:document-7"
            )),
            Ok(identity)
        );
        Ok(())
    }

    #[test]
    fn scope_incarnation_identity_accepts_the_exact_grammar_and_byte_limit()
    -> Result<(), LocalLogIdentityError> {
        assert_eq!(LocalLogStorageScopeIncarnationId::try_new("Z9._:-a0")?.as_str(), "Z9._:-a0");

        let maximum = "z".repeat(MAX_LOCAL_LOG_IDENTITY_BYTES);
        assert_eq!(LocalLogStorageScopeIncarnationId::try_new(&maximum)?.as_str(), maximum);
        Ok(())
    }

    #[test]
    fn scope_incarnation_identity_rejects_every_grammar_boundary() {
        assert_eq!(
            LocalLogStorageScopeIncarnationId::try_new(""),
            Err(LocalLogIdentityError::Empty)
        );
        assert_eq!(
            LocalLogStorageScopeIncarnationId::try_new(
                "z".repeat(MAX_LOCAL_LOG_IDENTITY_BYTES + 1)
            ),
            Err(LocalLogIdentityError::TooLong {
                actual: MAX_LOCAL_LOG_IDENTITY_BYTES + 1,
                maximum: MAX_LOCAL_LOG_IDENTITY_BYTES,
            })
        );
        assert_eq!(
            LocalLogStorageScopeIncarnationId::try_new("-scope"),
            Err(LocalLogIdentityError::InvalidStart)
        );
        assert_eq!(
            LocalLogStorageScopeIncarnationId::try_new("scope incarnation"),
            Err(LocalLogIdentityError::InvalidCharacter { byte_index: 5, character: ' ' })
        );
        assert_eq!(
            LocalLogStorageScopeIncarnationId::try_new("scope-界"),
            Err(LocalLogIdentityError::InvalidCharacter { byte_index: 6, character: '界' })
        );
    }
}

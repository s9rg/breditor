use std::{fmt, str::FromStr};

use crate::identity::{QualifiedName, QualifiedNameError};

/// Identifies one host-defined local-log storage profile.
///
/// A profile ID names a separately documented adapter contract. It does not
/// identify a storage scope, grant authority, or prove that an adapter follows
/// the named contract.
#[derive(Clone, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct LocalLogStorageProfileId(QualifiedName);

impl LocalLogStorageProfileId {
    /// Wraps an already validated qualified name as a storage-profile ID.
    #[must_use]
    pub const fn new(value: QualifiedName) -> Self {
        Self(value)
    }

    /// Validates and creates a storage-profile ID.
    ///
    /// # Errors
    ///
    /// Returns [`QualifiedNameError`] when `value` violates Breditor's
    /// lowercase `namespace/local-name` grammar or its 128-byte limit.
    pub fn try_new(value: impl AsRef<str>) -> Result<Self, QualifiedNameError> {
        QualifiedName::try_new(value).map(Self)
    }

    /// Returns the wrapped qualified name.
    #[must_use]
    pub const fn qualified_name(&self) -> &QualifiedName {
        &self.0
    }

    /// Returns the exact qualified-name text.
    #[must_use]
    pub fn as_str(&self) -> &str {
        self.0.as_str()
    }

    /// Unwraps this profile ID into its qualified name.
    #[must_use]
    pub fn into_qualified_name(self) -> QualifiedName {
        self.0
    }
}

impl AsRef<str> for LocalLogStorageProfileId {
    fn as_ref(&self) -> &str {
        self.as_str()
    }
}

impl fmt::Debug for LocalLogStorageProfileId {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.debug_tuple("LocalLogStorageProfileId").field(&self.as_str()).finish()
    }
}

impl fmt::Display for LocalLogStorageProfileId {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(self.as_str())
    }
}

impl From<QualifiedName> for LocalLogStorageProfileId {
    fn from(value: QualifiedName) -> Self {
        Self::new(value)
    }
}

impl FromStr for LocalLogStorageProfileId {
    type Err = QualifiedNameError;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        Self::try_new(value)
    }
}

impl TryFrom<String> for LocalLogStorageProfileId {
    type Error = QualifiedNameError;

    fn try_from(value: String) -> Result<Self, Self::Error> {
        QualifiedName::try_from(value).map(Self)
    }
}

#[cfg(test)]
mod tests {
    use super::LocalLogStorageProfileId;
    use crate::identity::{QualifiedName, QualifiedNameError};

    #[test]
    fn wraps_one_owned_qualified_profile_name() -> Result<(), QualifiedNameError> {
        let source = String::from("breditor/native-storage");
        let profile = LocalLogStorageProfileId::try_new(&source)?;
        drop(source);

        assert_eq!(profile.as_str(), "breditor/native-storage");
        assert_eq!(profile.qualified_name(), &QualifiedName::try_new(profile.as_str())?);
        assert_eq!(profile, profile.clone());
        assert_eq!(profile.to_string(), "breditor/native-storage");
        Ok(())
    }

    #[test]
    fn rejects_text_outside_the_qualified_name_grammar() {
        assert!(LocalLogStorageProfileId::try_new("Native/profile").is_err());
        assert!("not-qualified".parse::<LocalLogStorageProfileId>().is_err());
    }
}

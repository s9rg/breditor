use std::{fmt, str::FromStr, sync::Arc};

use super::identity::{LocalLogIdentityError, validate_local_log_identity};

/// Caller-supplied identity of one durable local editing session.
///
/// This identity is stable across log compaction and all append generations.
/// The core never derives it from a clock, random-number source, memory
/// address, or editor content.
#[derive(Clone, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct LocalSessionId(Arc<str>);

impl LocalSessionId {
    /// Validates and creates a durable local-session identity.
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

impl AsRef<str> for LocalSessionId {
    fn as_ref(&self) -> &str {
        self.as_str()
    }
}

impl fmt::Debug for LocalSessionId {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.debug_tuple("LocalSessionId").field(&self.as_str()).finish()
    }
}

impl fmt::Display for LocalSessionId {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(self.as_str())
    }
}

impl FromStr for LocalSessionId {
    type Err = LocalLogIdentityError;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        Self::try_new(value)
    }
}

impl TryFrom<String> for LocalSessionId {
    type Error = LocalLogIdentityError;

    fn try_from(value: String) -> Result<Self, Self::Error> {
        validate_local_log_identity(&value)?;
        Ok(Self(Arc::from(value)))
    }
}

#[cfg(test)]
mod tests {
    use super::LocalSessionId;

    #[test]
    fn identity_is_distinct_from_other_local_log_identity_types()
    -> Result<(), Box<dyn std::error::Error>> {
        let session = LocalSessionId::try_new("session:stable")?;

        assert_eq!(session.as_str(), "session:stable");
        Ok(())
    }
}

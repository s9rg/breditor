use std::{fmt, str::FromStr, sync::Arc};

use super::identity::{LocalLogIdentityError, validate_local_log_identity};

/// Caller-supplied identity of one append generation of a local log.
///
/// Compaction creates a new append generation and therefore requires a new
/// `LocalLogId`. It does not create a new [`super::LocalSessionId`] or reset
/// [`super::LocalLogSequence`]. The core never derives this identity from a
/// clock, random-number source, memory address, or log content.
#[derive(Clone, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct LocalLogId(Arc<str>);

impl LocalLogId {
    /// Validates and creates an append-generation identity.
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

impl AsRef<str> for LocalLogId {
    fn as_ref(&self) -> &str {
        self.as_str()
    }
}

impl fmt::Debug for LocalLogId {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.debug_tuple("LocalLogId").field(&self.as_str()).finish()
    }
}

impl fmt::Display for LocalLogId {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(self.as_str())
    }
}

impl FromStr for LocalLogId {
    type Err = LocalLogIdentityError;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        Self::try_new(value)
    }
}

impl TryFrom<String> for LocalLogId {
    type Error = LocalLogIdentityError;

    fn try_from(value: String) -> Result<Self, Self::Error> {
        validate_local_log_identity(&value)?;
        Ok(Self(Arc::from(value)))
    }
}

#[cfg(test)]
mod tests {
    use super::LocalLogId;

    #[test]
    fn identity_is_an_owned_cloneable_value() -> Result<(), Box<dyn std::error::Error>> {
        let source = String::from("log:generation-17");
        let identity = LocalLogId::try_new(&source)?;
        drop(source);

        assert_eq!(identity.as_str(), "log:generation-17");
        assert_eq!(identity, identity.clone());
        Ok(())
    }
}

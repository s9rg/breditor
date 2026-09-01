use std::{fmt, str::FromStr, sync::Arc};

use super::identity::{LocalLogIdentityError, validate_local_log_identity};

/// Caller-supplied idempotency identity of one logical event within a local session.
///
/// A host must keep replay IDs unique within one [`super::LocalSessionId`]. The
/// value layer validates portability but cannot prove cross-entry uniqueness.
/// The core never derives replay identity from a clock, randomness, memory
/// address, commit content, or a sequence number.
#[derive(Clone, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct ReplayId(Arc<str>);

impl ReplayId {
    /// Validates and creates a retry/replay identity.
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

impl AsRef<str> for ReplayId {
    fn as_ref(&self) -> &str {
        self.as_str()
    }
}

impl fmt::Debug for ReplayId {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.debug_tuple("ReplayId").field(&self.as_str()).finish()
    }
}

impl fmt::Display for ReplayId {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(self.as_str())
    }
}

impl FromStr for ReplayId {
    type Err = LocalLogIdentityError;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        Self::try_new(value)
    }
}

impl TryFrom<String> for ReplayId {
    type Error = LocalLogIdentityError;

    fn try_from(value: String) -> Result<Self, Self::Error> {
        validate_local_log_identity(&value)?;
        Ok(Self(Arc::from(value)))
    }
}

#[cfg(test)]
mod tests {
    use super::ReplayId;

    #[test]
    fn accepts_a_portable_caller_idempotency_key() -> Result<(), Box<dyn std::error::Error>> {
        let replay = ReplayId::try_new("request:01JY_2-attempt.1")?;

        assert_eq!(replay.to_string(), "request:01JY_2-attempt.1");
        Ok(())
    }
}

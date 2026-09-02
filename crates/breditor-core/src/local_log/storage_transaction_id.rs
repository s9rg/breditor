use std::{fmt, str::FromStr, sync::Arc};

use super::identity::{LocalLogIdentityError, validate_local_log_identity};

/// Caller-supplied identity of one local-log storage-generation transaction.
///
/// The value is opaque. This type enforces its portable syntax but cannot prove
/// the transaction ID's required lifetime uniqueness or bind it to one plan.
#[derive(Clone, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct LocalLogStorageTransactionId(Arc<str>);

impl LocalLogStorageTransactionId {
    /// Validates and creates a storage-transaction identity.
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

impl AsRef<str> for LocalLogStorageTransactionId {
    fn as_ref(&self) -> &str {
        self.as_str()
    }
}

impl fmt::Debug for LocalLogStorageTransactionId {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.debug_tuple("LocalLogStorageTransactionId").field(&self.as_str()).finish()
    }
}

impl fmt::Display for LocalLogStorageTransactionId {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(self.as_str())
    }
}

impl FromStr for LocalLogStorageTransactionId {
    type Err = LocalLogIdentityError;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        Self::try_new(value)
    }
}

impl TryFrom<String> for LocalLogStorageTransactionId {
    type Error = LocalLogIdentityError;

    fn try_from(value: String) -> Result<Self, Self::Error> {
        validate_local_log_identity(&value)?;
        Ok(Self(Arc::from(value)))
    }
}

#[cfg(test)]
mod tests {
    use super::LocalLogStorageTransactionId;
    use crate::local_log::LocalLogIdentityError;

    #[test]
    fn transaction_identity_is_owned_and_portable() -> Result<(), LocalLogIdentityError> {
        let source = String::from("transaction:rotation-9");
        let identity = LocalLogStorageTransactionId::try_new(&source)?;
        drop(source);

        assert_eq!(identity.as_str(), "transaction:rotation-9");
        assert_eq!(identity, identity.clone());
        assert_eq!(identity.to_string(), "transaction:rotation-9");
        Ok(())
    }

    #[test]
    fn transaction_identity_rejects_the_wrong_grammar() {
        assert!(LocalLogStorageTransactionId::try_new("transaction 9").is_err());
    }
}

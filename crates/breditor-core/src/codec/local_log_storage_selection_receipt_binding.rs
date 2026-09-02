use thiserror::Error;

use crate::local_log::{
    LocalLogStorageDatabaseIncarnationId, LocalLogStorageHeadId, LocalLogStorageProfileId,
    LocalLogStorageProfileVersion, LocalLogStorageScopeId, LocalLogStorageScopeIncarnationId,
    LocalLogStorageTransactionId, LocalSessionId,
};

use super::local_log_storage_selection_kind::LocalLogStorageSelectionKind;

/// Stable machine-readable category for a selected-receipt binding error.
#[non_exhaustive]
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub enum LocalLogStorageSelectionReceiptBindingErrorCode {
    /// A root receipt incorrectly named an expected predecessor head.
    UnexpectedExpectedHead,
    /// A rotation receipt omitted its expected predecessor head.
    MissingExpectedHead,
    /// A rotation reused its expected head as its committed head.
    HeadNotAdvanced,
}

impl LocalLogStorageSelectionReceiptBindingErrorCode {
    /// Returns the stable namespaced error code.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::UnexpectedExpectedHead => {
                "local_log_storage_selection_receipt_binding.unexpected_expected_head"
            }
            Self::MissingExpectedHead => {
                "local_log_storage_selection_receipt_binding.missing_expected_head"
            }
            Self::HeadNotAdvanced => {
                "local_log_storage_selection_receipt_binding.head_not_advanced"
            }
        }
    }
}

/// Why independently trusted transaction-receipt facts are not well shaped.
#[non_exhaustive]
#[derive(Clone, Copy, Debug, Eq, Error, Hash, Ord, PartialEq, PartialOrd)]
pub enum LocalLogStorageSelectionReceiptBindingError {
    /// Root selection has no predecessor and therefore no expected head.
    #[error("a root selection receipt must not name an expected head")]
    UnexpectedExpectedHead,
    /// Ordinary rotation must name the exact head it expected to replace.
    #[error("a rotation selection receipt must name an expected head")]
    MissingExpectedHead,
    /// Ordinary rotation must advance to a distinct committed head.
    #[error("a rotation selection receipt must advance to a distinct committed head")]
    HeadNotAdvanced,
}

impl LocalLogStorageSelectionReceiptBindingError {
    /// Returns the stable machine-readable error category.
    #[must_use]
    pub const fn code(&self) -> LocalLogStorageSelectionReceiptBindingErrorCode {
        match self {
            Self::UnexpectedExpectedHead => {
                LocalLogStorageSelectionReceiptBindingErrorCode::UnexpectedExpectedHead
            }
            Self::MissingExpectedHead => {
                LocalLogStorageSelectionReceiptBindingErrorCode::MissingExpectedHead
            }
            Self::HeadNotAdvanced => {
                LocalLogStorageSelectionReceiptBindingErrorCode::HeadNotAdvanced
            }
        }
    }
}

/// Independently trusted binding for one exact selected transaction receipt.
///
/// Every field must come from trusted profile-envelope and storage-record
/// facts, independently of the candidate selection JSON that will be decoded.
/// The binding contains no candidate bytes, mutable writer epoch, current
/// writer fence, browser handle, or authorization capability.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct LocalLogStorageSelectionReceiptBinding {
    profile_id: LocalLogStorageProfileId,
    profile_version: LocalLogStorageProfileVersion,
    database_incarnation_id: LocalLogStorageDatabaseIncarnationId,
    scope_id: LocalLogStorageScopeId,
    scope_incarnation_id: LocalLogStorageScopeIncarnationId,
    transaction_id: LocalLogStorageTransactionId,
    expected_head_id: Option<LocalLogStorageHeadId>,
    committed_head_id: LocalLogStorageHeadId,
    selection_kind: LocalLogStorageSelectionKind,
    session_id: LocalSessionId,
}

impl LocalLogStorageSelectionReceiptBinding {
    /// Creates one complete trusted receipt association.
    ///
    /// # Errors
    ///
    /// Root receipts reject any expected head. Rotation receipts require an
    /// expected head and reject equality between that head and the committed
    /// head.
    #[allow(clippy::too_many_arguments)]
    pub fn try_new(
        profile_id: LocalLogStorageProfileId,
        profile_version: LocalLogStorageProfileVersion,
        database_incarnation_id: LocalLogStorageDatabaseIncarnationId,
        scope_id: LocalLogStorageScopeId,
        scope_incarnation_id: LocalLogStorageScopeIncarnationId,
        transaction_id: LocalLogStorageTransactionId,
        expected_head_id: Option<LocalLogStorageHeadId>,
        committed_head_id: LocalLogStorageHeadId,
        selection_kind: LocalLogStorageSelectionKind,
        session_id: LocalSessionId,
    ) -> Result<Self, LocalLogStorageSelectionReceiptBindingError> {
        match selection_kind {
            LocalLogStorageSelectionKind::Root => {
                if expected_head_id.is_some() {
                    return Err(
                        LocalLogStorageSelectionReceiptBindingError::UnexpectedExpectedHead,
                    );
                }
            }
            LocalLogStorageSelectionKind::Rotation => match expected_head_id.as_ref() {
                None => {
                    return Err(LocalLogStorageSelectionReceiptBindingError::MissingExpectedHead);
                }
                Some(expected_head_id) if expected_head_id == &committed_head_id => {
                    return Err(LocalLogStorageSelectionReceiptBindingError::HeadNotAdvanced);
                }
                Some(_) => {}
            },
        }

        Ok(Self {
            profile_id,
            profile_version,
            database_incarnation_id,
            scope_id,
            scope_incarnation_id,
            transaction_id,
            expected_head_id,
            committed_head_id,
            selection_kind,
            session_id,
        })
    }

    /// Returns the independently trusted storage-profile identity.
    #[must_use]
    pub const fn profile_id(&self) -> &LocalLogStorageProfileId {
        &self.profile_id
    }

    /// Returns the independently trusted storage-profile version.
    #[must_use]
    pub const fn profile_version(&self) -> LocalLogStorageProfileVersion {
        self.profile_version
    }

    /// Returns the exact physical profile-database incarnation.
    #[must_use]
    pub const fn database_incarnation_id(&self) -> &LocalLogStorageDatabaseIncarnationId {
        &self.database_incarnation_id
    }

    /// Returns the selected storage scope.
    #[must_use]
    pub const fn scope_id(&self) -> &LocalLogStorageScopeId {
        &self.scope_id
    }

    /// Returns the exact lifetime incarnation of the selected scope.
    #[must_use]
    pub const fn scope_incarnation_id(&self) -> &LocalLogStorageScopeIncarnationId {
        &self.scope_incarnation_id
    }

    /// Returns the exact selected transaction identity.
    #[must_use]
    pub const fn transaction_id(&self) -> &LocalLogStorageTransactionId {
        &self.transaction_id
    }

    /// Returns the trusted expected head, which is absent exactly for a root.
    #[must_use]
    pub const fn expected_head_id(&self) -> Option<&LocalLogStorageHeadId> {
        self.expected_head_id.as_ref()
    }

    /// Returns the authoritative head committed by this receipt.
    #[must_use]
    pub const fn committed_head_id(&self) -> &LocalLogStorageHeadId {
        &self.committed_head_id
    }

    /// Returns whether the receipt selects a root or an ordinary rotation.
    #[must_use]
    pub const fn selection_kind(&self) -> LocalLogStorageSelectionKind {
        self.selection_kind
    }

    /// Returns the stable local-session identity recorded by the scope.
    #[must_use]
    pub const fn session_id(&self) -> &LocalSessionId {
        &self.session_id
    }
}

#[cfg(test)]
mod tests {
    use super::{
        LocalLogStorageSelectionKind, LocalLogStorageSelectionReceiptBinding,
        LocalLogStorageSelectionReceiptBindingError,
        LocalLogStorageSelectionReceiptBindingErrorCode,
    };
    use crate::local_log::{
        LocalLogStorageDatabaseIncarnationId, LocalLogStorageHeadId, LocalLogStorageProfileId,
        LocalLogStorageProfileVersion, LocalLogStorageScopeId, LocalLogStorageScopeIncarnationId,
        LocalLogStorageTransactionId, LocalSessionId,
    };

    struct Facts {
        profile_id: LocalLogStorageProfileId,
        profile_version: LocalLogStorageProfileVersion,
        database_incarnation_id: LocalLogStorageDatabaseIncarnationId,
        scope_id: LocalLogStorageScopeId,
        scope_incarnation_id: LocalLogStorageScopeIncarnationId,
        transaction_id: LocalLogStorageTransactionId,
        committed_head_id: LocalLogStorageHeadId,
        session_id: LocalSessionId,
    }

    impl Facts {
        fn new() -> Result<Self, Box<dyn std::error::Error>> {
            Ok(Self {
                profile_id: LocalLogStorageProfileId::try_new("breditor/test-storage")?,
                profile_version: LocalLogStorageProfileVersion::try_new(1)?,
                database_incarnation_id: LocalLogStorageDatabaseIncarnationId::try_new(
                    "database:test",
                )?,
                scope_id: LocalLogStorageScopeId::try_new("scope:test")?,
                scope_incarnation_id: LocalLogStorageScopeIncarnationId::try_new(
                    "scope-incarnation:test",
                )?,
                transaction_id: LocalLogStorageTransactionId::try_new("transaction:test")?,
                committed_head_id: LocalLogStorageHeadId::try_new("head:committed")?,
                session_id: LocalSessionId::try_new("session:test")?,
            })
        }

        fn bind(
            self,
            expected_head_id: Option<LocalLogStorageHeadId>,
            selection_kind: LocalLogStorageSelectionKind,
        ) -> Result<
            LocalLogStorageSelectionReceiptBinding,
            LocalLogStorageSelectionReceiptBindingError,
        > {
            LocalLogStorageSelectionReceiptBinding::try_new(
                self.profile_id,
                self.profile_version,
                self.database_incarnation_id,
                self.scope_id,
                self.scope_incarnation_id,
                self.transaction_id,
                expected_head_id,
                self.committed_head_id,
                selection_kind,
                self.session_id,
            )
        }
    }

    #[test]
    fn root_requires_no_expected_head() -> Result<(), Box<dyn std::error::Error>> {
        let binding = Facts::new()?.bind(None, LocalLogStorageSelectionKind::Root)?;

        assert_eq!(binding.selection_kind(), LocalLogStorageSelectionKind::Root);
        assert_eq!(binding.expected_head_id(), None);
        assert_eq!(binding.committed_head_id().as_str(), "head:committed");
        assert_eq!(binding.database_incarnation_id().as_str(), "database:test");
        assert_eq!(binding.scope_incarnation_id().as_str(), "scope-incarnation:test");
        assert_eq!(binding.session_id().as_str(), "session:test");
        assert_eq!(
            Facts::new()?.bind(
                Some(LocalLogStorageHeadId::try_new("head:old")?),
                LocalLogStorageSelectionKind::Root,
            ),
            Err(LocalLogStorageSelectionReceiptBindingError::UnexpectedExpectedHead)
        );
        Ok(())
    }

    #[test]
    fn rotation_requires_one_distinct_expected_head() -> Result<(), Box<dyn std::error::Error>> {
        assert_eq!(
            Facts::new()?.bind(None, LocalLogStorageSelectionKind::Rotation),
            Err(LocalLogStorageSelectionReceiptBindingError::MissingExpectedHead)
        );
        assert_eq!(
            Facts::new()?.bind(
                Some(LocalLogStorageHeadId::try_new("head:committed")?),
                LocalLogStorageSelectionKind::Rotation,
            ),
            Err(LocalLogStorageSelectionReceiptBindingError::HeadNotAdvanced)
        );

        let binding = Facts::new()?.bind(
            Some(LocalLogStorageHeadId::try_new("head:old")?),
            LocalLogStorageSelectionKind::Rotation,
        )?;
        assert_eq!(binding.expected_head_id().map(LocalLogStorageHeadId::as_str), Some("head:old"));
        Ok(())
    }

    #[test]
    fn receipt_error_codes_are_stable() {
        assert_eq!(
            LocalLogStorageSelectionReceiptBindingError::HeadNotAdvanced.code(),
            LocalLogStorageSelectionReceiptBindingErrorCode::HeadNotAdvanced
        );
        assert_eq!(
            LocalLogStorageSelectionReceiptBindingErrorCode::UnexpectedExpectedHead.as_str(),
            "local_log_storage_selection_receipt_binding.unexpected_expected_head"
        );
    }
}

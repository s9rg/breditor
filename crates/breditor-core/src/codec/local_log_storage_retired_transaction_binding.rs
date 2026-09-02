use thiserror::Error;

use crate::local_log::{
    LocalLogStorageDatabaseIncarnationId, LocalLogStorageHeadId, LocalLogStorageScopeId,
    LocalLogStorageScopeIncarnationId, LocalLogStorageTransactionId,
};

use super::LocalLogStorageSelectionKind;

/// Stable machine-readable category for a retired-transaction binding error.
#[non_exhaustive]
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub enum LocalLogStorageRetiredTransactionBindingErrorCode {
    /// A retired root incorrectly names an expected predecessor head.
    UnexpectedExpectedHead,
    /// A retired rotation omits its expected predecessor head.
    MissingExpectedHead,
    /// A retired rotation reuses one head as expected and committed.
    HeadNotAdvanced,
}

impl LocalLogStorageRetiredTransactionBindingErrorCode {
    /// Returns the stable namespaced error code.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::UnexpectedExpectedHead => {
                "local_log_storage_retired_transaction_binding.unexpected_expected_head"
            }
            Self::MissingExpectedHead => {
                "local_log_storage_retired_transaction_binding.missing_expected_head"
            }
            Self::HeadNotAdvanced => {
                "local_log_storage_retired_transaction_binding.head_not_advanced"
            }
        }
    }
}

/// Why independently observed retired-transaction facts are not well shaped.
#[non_exhaustive]
#[derive(Clone, Copy, Debug, Eq, Error, Hash, Ord, PartialEq, PartialOrd)]
pub enum LocalLogStorageRetiredTransactionBindingError {
    /// A root has no expected predecessor head.
    #[error("a retired root transaction must not name an expected head")]
    UnexpectedExpectedHead,
    /// A rotation must retain its expected predecessor head.
    #[error("a retired rotation transaction must name an expected head")]
    MissingExpectedHead,
    /// A rotation must have advanced to a distinct committed head.
    #[error("a retired rotation transaction must advance to a distinct committed head")]
    HeadNotAdvanced,
}

impl LocalLogStorageRetiredTransactionBindingError {
    /// Returns the stable machine-readable failure category.
    #[must_use]
    pub const fn code(&self) -> LocalLogStorageRetiredTransactionBindingErrorCode {
        match self {
            Self::UnexpectedExpectedHead => {
                LocalLogStorageRetiredTransactionBindingErrorCode::UnexpectedExpectedHead
            }
            Self::MissingExpectedHead => {
                LocalLogStorageRetiredTransactionBindingErrorCode::MissingExpectedHead
            }
            Self::HeadNotAdvanced => {
                LocalLogStorageRetiredTransactionBindingErrorCode::HeadNotAdvanced
            }
        }
    }
}

/// Closed record-shaped facts for one Profile V1 retired transaction.
///
/// This type contains exactly the immutable identity and byte-length fields
/// retained by the `IndexedDB` tombstone. It deliberately has no profile ID,
/// profile version, session ID, selection JSON, or claimed byte equality,
/// because the retired record stores none of them. `selection_byte_length` is
/// collision screening only; matching it cannot attest caller-supplied bytes.
///
/// Constructing this value validates root/rotation head shape only. It does
/// not prove record existence, state/version parsing, transaction-key lookup,
/// `byCommittedHead` index agreement, current-graph validity, historical
/// commit, currentness, durability, cleanup, or writer authority.
///
/// A retired tombstone deliberately exposes no selection-payload accessor:
///
/// ```compile_fail
/// fn selection_json(
///     binding: &breditor_core::codec::LocalLogStorageRetiredTransactionBinding,
/// ) {
///     let _ = binding.selection_json();
/// }
/// ```
///
/// It is an in-process comparison value, not a serialization contract:
///
/// ```compile_fail
/// fn serialize(
///     binding: &breditor_core::codec::LocalLogStorageRetiredTransactionBinding,
/// ) {
///     let _ = serde_json::to_string(binding);
/// }
/// ```
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct LocalLogStorageRetiredTransactionBinding {
    database_incarnation_id: LocalLogStorageDatabaseIncarnationId,
    scope_id: LocalLogStorageScopeId,
    scope_incarnation_id: LocalLogStorageScopeIncarnationId,
    transaction_id: LocalLogStorageTransactionId,
    expected_head_id: Option<LocalLogStorageHeadId>,
    committed_head_id: LocalLogStorageHeadId,
    selection_kind: LocalLogStorageSelectionKind,
    selection_byte_length: u64,
}

impl LocalLogStorageRetiredTransactionBinding {
    /// Creates one complete retired-transaction record binding.
    ///
    /// # Errors
    ///
    /// Root records reject an expected head. Rotation records require a
    /// distinct expected head.
    #[allow(clippy::too_many_arguments)]
    pub fn try_new(
        database_incarnation_id: LocalLogStorageDatabaseIncarnationId,
        scope_id: LocalLogStorageScopeId,
        scope_incarnation_id: LocalLogStorageScopeIncarnationId,
        transaction_id: LocalLogStorageTransactionId,
        expected_head_id: Option<LocalLogStorageHeadId>,
        committed_head_id: LocalLogStorageHeadId,
        selection_kind: LocalLogStorageSelectionKind,
        selection_byte_length: u64,
    ) -> Result<Self, LocalLogStorageRetiredTransactionBindingError> {
        match selection_kind {
            LocalLogStorageSelectionKind::Root if expected_head_id.is_some() => {
                return Err(LocalLogStorageRetiredTransactionBindingError::UnexpectedExpectedHead);
            }
            LocalLogStorageSelectionKind::Rotation => match expected_head_id.as_ref() {
                None => {
                    return Err(LocalLogStorageRetiredTransactionBindingError::MissingExpectedHead);
                }
                Some(expected_head_id) if expected_head_id == &committed_head_id => {
                    return Err(LocalLogStorageRetiredTransactionBindingError::HeadNotAdvanced);
                }
                Some(_) => {}
            },
            LocalLogStorageSelectionKind::Root => {}
        }

        Ok(Self {
            database_incarnation_id,
            scope_id,
            scope_incarnation_id,
            transaction_id,
            expected_head_id,
            committed_head_id,
            selection_kind,
            selection_byte_length,
        })
    }

    /// Returns the physical profile-database incarnation.
    #[must_use]
    pub const fn database_incarnation_id(&self) -> &LocalLogStorageDatabaseIncarnationId {
        &self.database_incarnation_id
    }

    /// Returns the logical storage scope.
    #[must_use]
    pub const fn scope_id(&self) -> &LocalLogStorageScopeId {
        &self.scope_id
    }

    /// Returns the lifetime incarnation of that scope.
    #[must_use]
    pub const fn scope_incarnation_id(&self) -> &LocalLogStorageScopeIncarnationId {
        &self.scope_incarnation_id
    }

    /// Returns the permanently allocated transaction identity.
    #[must_use]
    pub const fn transaction_id(&self) -> &LocalLogStorageTransactionId {
        &self.transaction_id
    }

    /// Returns the expected predecessor head, present only for a rotation.
    #[must_use]
    pub const fn expected_head_id(&self) -> Option<&LocalLogStorageHeadId> {
        self.expected_head_id.as_ref()
    }

    /// Returns the permanently allocated committed-head identity.
    #[must_use]
    pub const fn committed_head_id(&self) -> &LocalLogStorageHeadId {
        &self.committed_head_id
    }

    /// Returns whether the retired value was a root or rotation.
    #[must_use]
    pub const fn selection_kind(&self) -> LocalLogStorageSelectionKind {
        self.selection_kind
    }

    /// Returns the stored exact-selection byte length.
    ///
    /// The length is collision screening, not evidence that any supplied bytes
    /// equal the retired selection.
    #[must_use]
    pub const fn selection_byte_length(&self) -> u64 {
        self.selection_byte_length
    }
}

#[cfg(test)]
mod tests {
    use super::{
        LocalLogStorageRetiredTransactionBinding, LocalLogStorageRetiredTransactionBindingError,
        LocalLogStorageRetiredTransactionBindingErrorCode,
    };
    use crate::{
        codec::LocalLogStorageSelectionKind,
        local_log::{
            LocalLogStorageDatabaseIncarnationId, LocalLogStorageHeadId, LocalLogStorageScopeId,
            LocalLogStorageScopeIncarnationId, LocalLogStorageTransactionId,
        },
    };

    type TestResult<T = ()> = Result<T, Box<dyn std::error::Error>>;

    fn binding(
        selection_kind: LocalLogStorageSelectionKind,
        expected_head_id: Option<&str>,
        committed_head_id: &str,
        selection_byte_length: u64,
    ) -> Result<LocalLogStorageRetiredTransactionBinding, Box<dyn std::error::Error>> {
        Ok(LocalLogStorageRetiredTransactionBinding::try_new(
            LocalLogStorageDatabaseIncarnationId::try_new("database:retired-tests")?,
            LocalLogStorageScopeId::try_new("scope:retired-tests")?,
            LocalLogStorageScopeIncarnationId::try_new("scope-incarnation:retired-tests")?,
            LocalLogStorageTransactionId::try_new("transaction:retired-tests")?,
            expected_head_id.map(LocalLogStorageHeadId::try_new).transpose()?,
            LocalLogStorageHeadId::try_new(committed_head_id)?,
            selection_kind,
            selection_byte_length,
        )?)
    }

    #[test]
    fn root_and_rotation_retain_only_available_tombstone_facts() -> TestResult {
        let root = binding(LocalLogStorageSelectionKind::Root, None, "head:root", 0)?;
        assert_eq!(root.expected_head_id(), None);
        assert_eq!(root.committed_head_id().as_str(), "head:root");
        assert_eq!(root.selection_kind(), LocalLogStorageSelectionKind::Root);
        assert_eq!(root.selection_byte_length(), 0);

        let rotation = binding(
            LocalLogStorageSelectionKind::Rotation,
            Some("head:old"),
            "head:new",
            u64::MAX,
        )?;
        assert_eq!(rotation.database_incarnation_id().as_str(), "database:retired-tests");
        assert_eq!(rotation.scope_id().as_str(), "scope:retired-tests");
        assert_eq!(rotation.scope_incarnation_id().as_str(), "scope-incarnation:retired-tests");
        assert_eq!(rotation.transaction_id().as_str(), "transaction:retired-tests");
        assert_eq!(
            rotation.expected_head_id().map(LocalLogStorageHeadId::as_str),
            Some("head:old")
        );
        assert_eq!(rotation.committed_head_id().as_str(), "head:new");
        assert_eq!(rotation.selection_kind(), LocalLogStorageSelectionKind::Rotation);
        assert_eq!(rotation.selection_byte_length(), u64::MAX);
        assert!(!format!("{rotation:?}").contains("SELECTIONPAYLOADSENTINEL"));
        Ok(())
    }

    #[test]
    fn equal_byte_length_does_not_collapse_distinct_transaction_identity() -> TestResult {
        let first = binding(LocalLogStorageSelectionKind::Root, None, "head:root", 777)?;
        let second = LocalLogStorageRetiredTransactionBinding::try_new(
            LocalLogStorageDatabaseIncarnationId::try_new("database:retired-tests")?,
            LocalLogStorageScopeId::try_new("scope:retired-tests")?,
            LocalLogStorageScopeIncarnationId::try_new("scope-incarnation:retired-tests")?,
            LocalLogStorageTransactionId::try_new("transaction:other")?,
            None,
            LocalLogStorageHeadId::try_new("head:root")?,
            LocalLogStorageSelectionKind::Root,
            777,
        )?;

        assert_eq!(first.selection_byte_length(), second.selection_byte_length());
        assert_ne!(first.transaction_id(), second.transaction_id());
        assert_ne!(first, second);
        Ok(())
    }

    #[test]
    fn root_and_rotation_head_shapes_fail_closed() -> TestResult {
        let root_error = LocalLogStorageRetiredTransactionBinding::try_new(
            LocalLogStorageDatabaseIncarnationId::try_new("database:retired-tests")?,
            LocalLogStorageScopeId::try_new("scope:retired-tests")?,
            LocalLogStorageScopeIncarnationId::try_new("scope-incarnation:retired-tests")?,
            LocalLogStorageTransactionId::try_new("transaction:root")?,
            Some(LocalLogStorageHeadId::try_new("head:unexpected")?),
            LocalLogStorageHeadId::try_new("head:root")?,
            LocalLogStorageSelectionKind::Root,
            1,
        );
        assert_eq!(
            root_error,
            Err(LocalLogStorageRetiredTransactionBindingError::UnexpectedExpectedHead)
        );

        let missing = LocalLogStorageRetiredTransactionBinding::try_new(
            LocalLogStorageDatabaseIncarnationId::try_new("database:retired-tests")?,
            LocalLogStorageScopeId::try_new("scope:retired-tests")?,
            LocalLogStorageScopeIncarnationId::try_new("scope-incarnation:retired-tests")?,
            LocalLogStorageTransactionId::try_new("transaction:rotation")?,
            None,
            LocalLogStorageHeadId::try_new("head:new")?,
            LocalLogStorageSelectionKind::Rotation,
            1,
        );
        assert_eq!(
            missing,
            Err(LocalLogStorageRetiredTransactionBindingError::MissingExpectedHead)
        );

        let same_head = LocalLogStorageRetiredTransactionBinding::try_new(
            LocalLogStorageDatabaseIncarnationId::try_new("database:retired-tests")?,
            LocalLogStorageScopeId::try_new("scope:retired-tests")?,
            LocalLogStorageScopeIncarnationId::try_new("scope-incarnation:retired-tests")?,
            LocalLogStorageTransactionId::try_new("transaction:rotation")?,
            Some(LocalLogStorageHeadId::try_new("head:same")?),
            LocalLogStorageHeadId::try_new("head:same")?,
            LocalLogStorageSelectionKind::Rotation,
            1,
        );
        assert_eq!(same_head, Err(LocalLogStorageRetiredTransactionBindingError::HeadNotAdvanced));
        Ok(())
    }

    #[test]
    fn errors_have_stable_payload_free_codes() {
        for (error, expected) in [
            (
                LocalLogStorageRetiredTransactionBindingError::UnexpectedExpectedHead,
                LocalLogStorageRetiredTransactionBindingErrorCode::UnexpectedExpectedHead,
            ),
            (
                LocalLogStorageRetiredTransactionBindingError::MissingExpectedHead,
                LocalLogStorageRetiredTransactionBindingErrorCode::MissingExpectedHead,
            ),
            (
                LocalLogStorageRetiredTransactionBindingError::HeadNotAdvanced,
                LocalLogStorageRetiredTransactionBindingErrorCode::HeadNotAdvanced,
            ),
        ] {
            assert_eq!(error.code(), expected);
            assert!(
                expected.as_str().starts_with("local_log_storage_retired_transaction_binding.")
            );
            assert!(!format!("{error:?} {error}").contains("SELECTIONPAYLOADSENTINEL"));
        }
    }
}

use std::fmt;

use thiserror::Error;

use super::{
    local_log_storage_selected_generation_binding::{
        LocalLogStorageSelectedActiveGenerationBinding,
        LocalLogStorageSelectedCheckpointGenerationBinding,
        LocalLogStorageSelectedCheckpointGenerationState,
    },
    local_log_storage_selection_kind::LocalLogStorageSelectionKind,
    local_log_storage_selection_receipt_binding::LocalLogStorageSelectionReceiptBinding,
};

/// One immutable receipt field that disagrees across a selected edge.
#[non_exhaustive]
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub enum LocalLogStorageSelectedReceiptMismatchField {
    /// Storage-profile identity.
    ProfileId,
    /// Storage-profile contract version.
    ProfileVersion,
    /// Physical profile-database incarnation.
    DatabaseIncarnationId,
    /// Logical storage scope.
    ScopeId,
    /// Lifetime incarnation of that logical scope.
    ScopeIncarnationId,
    /// Stable local-session identity.
    SessionId,
}

impl LocalLogStorageSelectedReceiptMismatchField {
    /// Returns the stable profile field spelling.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::ProfileId => "profileId",
            Self::ProfileVersion => "profileVersion",
            Self::DatabaseIncarnationId => "databaseIncarnationId",
            Self::ScopeId => "scopeId",
            Self::ScopeIncarnationId => "scopeIncarnationId",
            Self::SessionId => "sessionId",
        }
    }
}

impl fmt::Display for LocalLogStorageSelectedReceiptMismatchField {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(self.as_str())
    }
}

/// One selected generation field that disagrees with the current receipt.
#[non_exhaustive]
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub enum LocalLogStorageSelectedGenerationMismatchField {
    /// Checkpoint generation's session identity.
    CheckpointSessionId,
    /// Root checkpoint-only generation's establishing head.
    CheckpointEstablishedByHeadId,
    /// Rotation checkpoint generation's activating head.
    CheckpointActivatedByHeadId,
    /// Rotation checkpoint generation's retiring head.
    CheckpointRetiredByHeadId,
    /// Active generation's session identity.
    ActiveSessionId,
    /// Active generation's activating head.
    ActiveActivatedByHeadId,
}

impl LocalLogStorageSelectedGenerationMismatchField {
    /// Returns the stable diagnostic field spelling.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::CheckpointSessionId => "checkpoint.sessionId",
            Self::CheckpointEstablishedByHeadId => "checkpoint.establishedByHeadId",
            Self::CheckpointActivatedByHeadId => "checkpoint.activatedByHeadId",
            Self::CheckpointRetiredByHeadId => "checkpoint.retiredByHeadId",
            Self::ActiveSessionId => "active.sessionId",
            Self::ActiveActivatedByHeadId => "active.activatedByHeadId",
        }
    }
}

impl fmt::Display for LocalLogStorageSelectedGenerationMismatchField {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(self.as_str())
    }
}

/// Stable machine-readable category for a selected-binding error.
#[non_exhaustive]
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub enum LocalLogStorageSelectedBindingErrorCode {
    /// A root incorrectly carried an exact predecessor receipt.
    UnexpectedPredecessor,
    /// A rotation omitted its exact predecessor receipt.
    MissingPredecessor,
    /// The selection kind and checkpoint generation state disagree.
    CheckpointStateMismatch,
    /// Current and predecessor immutable receipt fields disagree.
    PredecessorMismatch,
    /// The current expected head does not name the predecessor's committed head.
    ExpectedHeadMismatch,
    /// Current and predecessor receipts reuse one transaction identity.
    TransactionIdReused,
    /// The current committed head reuses the predecessor's known expected head.
    KnownHeadIdReused,
    /// Current and checkpoint generations reuse one activation fence identity.
    ActivationFenceReused,
    /// A generation fact disagrees with the current receipt.
    GenerationMismatch,
    /// Checkpoint and active generation identities are equal.
    GenerationNotAdvanced,
}

impl LocalLogStorageSelectedBindingErrorCode {
    /// Returns the stable namespaced error code.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::UnexpectedPredecessor => {
                "local_log_storage_selected_binding.unexpected_predecessor"
            }
            Self::MissingPredecessor => "local_log_storage_selected_binding.missing_predecessor",
            Self::CheckpointStateMismatch => {
                "local_log_storage_selected_binding.checkpoint_state_mismatch"
            }
            Self::PredecessorMismatch => "local_log_storage_selected_binding.predecessor_mismatch",
            Self::ExpectedHeadMismatch => {
                "local_log_storage_selected_binding.expected_head_mismatch"
            }
            Self::TransactionIdReused => "local_log_storage_selected_binding.transaction_id_reused",
            Self::KnownHeadIdReused => "local_log_storage_selected_binding.known_head_id_reused",
            Self::ActivationFenceReused => {
                "local_log_storage_selected_binding.activation_fence_reused"
            }
            Self::GenerationMismatch => "local_log_storage_selected_binding.generation_mismatch",
            Self::GenerationNotAdvanced => {
                "local_log_storage_selected_binding.generation_not_advanced"
            }
        }
    }
}

/// Why trusted selected-receipt and generation facts do not form one selection.
#[non_exhaustive]
#[derive(Clone, Copy, Debug, Eq, Error, Hash, Ord, PartialEq, PartialOrd)]
pub enum LocalLogStorageSelectedBindingError {
    /// Root is the first selection and cannot have a predecessor receipt.
    #[error("a selected root must not carry a predecessor receipt")]
    UnexpectedPredecessor,
    /// Rotation must retain and bind its one exact immediate predecessor.
    #[error("a selected rotation must carry its exact predecessor receipt")]
    MissingPredecessor,
    /// The checkpoint generation has a state forbidden for the selection kind.
    #[error(
        "selection kind {selection_kind} is incompatible with checkpoint generation state {checkpoint_state}"
    )]
    CheckpointStateMismatch {
        /// Current root-or-rotation selection kind.
        selection_kind: LocalLogStorageSelectionKind,
        /// Observed checkpoint generation state.
        checkpoint_state: LocalLogStorageSelectedCheckpointGenerationState,
    },
    /// One immutable envelope field differs between current and predecessor.
    #[error("current and predecessor selected receipts disagree at {field}")]
    PredecessorMismatch {
        /// Receipt field that did not agree.
        field: LocalLogStorageSelectedReceiptMismatchField,
    },
    /// Rotation does not directly extend its bound predecessor's committed head.
    #[error("current expected head does not equal predecessor committed head")]
    ExpectedHeadMismatch,
    /// The two retained exact receipts cannot describe the same transaction.
    #[error("current and predecessor selected receipts reuse one transaction identity")]
    TransactionIdReused,
    /// The current committed head cannot reuse the predecessor rotation's known expected head.
    #[error("current committed head reuses predecessor expected head")]
    KnownHeadIdReused,
    /// The current and checkpoint generations cannot share an activation fence.
    #[error("current and checkpoint generations reuse one activation fence identity")]
    ActivationFenceReused,
    /// One generation fact disagrees with the current selected receipt.
    #[error("selected generation facts disagree with the current receipt at {field}")]
    GenerationMismatch {
        /// Generation field that did not agree.
        field: LocalLogStorageSelectedGenerationMismatchField,
    },
    /// One selection cannot use the same checkpoint and active generation.
    #[error("selected checkpoint and active generation identities must be distinct")]
    GenerationNotAdvanced,
}

impl LocalLogStorageSelectedBindingError {
    /// Returns the stable machine-readable error category.
    #[must_use]
    pub const fn code(&self) -> LocalLogStorageSelectedBindingErrorCode {
        match self {
            Self::UnexpectedPredecessor => {
                LocalLogStorageSelectedBindingErrorCode::UnexpectedPredecessor
            }
            Self::MissingPredecessor => LocalLogStorageSelectedBindingErrorCode::MissingPredecessor,
            Self::CheckpointStateMismatch { .. } => {
                LocalLogStorageSelectedBindingErrorCode::CheckpointStateMismatch
            }
            Self::PredecessorMismatch { .. } => {
                LocalLogStorageSelectedBindingErrorCode::PredecessorMismatch
            }
            Self::ExpectedHeadMismatch => {
                LocalLogStorageSelectedBindingErrorCode::ExpectedHeadMismatch
            }
            Self::TransactionIdReused => {
                LocalLogStorageSelectedBindingErrorCode::TransactionIdReused
            }
            Self::KnownHeadIdReused => LocalLogStorageSelectedBindingErrorCode::KnownHeadIdReused,
            Self::ActivationFenceReused => {
                LocalLogStorageSelectedBindingErrorCode::ActivationFenceReused
            }
            Self::GenerationMismatch { .. } => {
                LocalLogStorageSelectedBindingErrorCode::GenerationMismatch
            }
            Self::GenerationNotAdvanced => {
                LocalLogStorageSelectedBindingErrorCode::GenerationNotAdvanced
            }
        }
    }
}

/// Complete trusted scalar binding for one current selected storage value.
///
/// This value combines the current exact transaction receipt, its exact
/// immediate predecessor when required, and both named generation records.
/// It deliberately contains neither selection JSON nor mutable writer
/// epoch/fence facts. Constructing it validates the O(1) cross-links that do
/// not depend on strictly decoding the current and predecessor JSON values.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct LocalLogStorageSelectedBinding {
    current_receipt: LocalLogStorageSelectionReceiptBinding,
    predecessor_receipt: Option<LocalLogStorageSelectionReceiptBinding>,
    checkpoint_generation: LocalLogStorageSelectedCheckpointGenerationBinding,
    active_generation: LocalLogStorageSelectedActiveGenerationBinding,
}

impl LocalLogStorageSelectedBinding {
    /// Validates and creates one complete trusted selected binding.
    ///
    /// # Errors
    ///
    /// This rejects the wrong predecessor/checkpoint shape for the current
    /// selection kind, broken receipt continuity, generation session/head
    /// mismatches, generation identity reuse, and adjacent activation-fence
    /// reuse.
    pub fn try_new(
        current_receipt: LocalLogStorageSelectionReceiptBinding,
        predecessor_receipt: Option<LocalLogStorageSelectionReceiptBinding>,
        checkpoint_generation: LocalLogStorageSelectedCheckpointGenerationBinding,
        active_generation: LocalLogStorageSelectedActiveGenerationBinding,
    ) -> Result<Self, LocalLogStorageSelectedBindingError> {
        match current_receipt.selection_kind() {
            LocalLogStorageSelectionKind::Root => {
                if predecessor_receipt.is_some() {
                    return Err(LocalLogStorageSelectedBindingError::UnexpectedPredecessor);
                }
                if checkpoint_generation.state()
                    != LocalLogStorageSelectedCheckpointGenerationState::CheckpointOnly
                {
                    return Err(LocalLogStorageSelectedBindingError::CheckpointStateMismatch {
                        selection_kind: LocalLogStorageSelectionKind::Root,
                        checkpoint_state: checkpoint_generation.state(),
                    });
                }
                if checkpoint_generation.established_by_head_id()
                    != Some(current_receipt.committed_head_id())
                {
                    return Err(LocalLogStorageSelectedBindingError::GenerationMismatch {
                        field: LocalLogStorageSelectedGenerationMismatchField::CheckpointEstablishedByHeadId,
                    });
                }
            }
            LocalLogStorageSelectionKind::Rotation => {
                let Some(predecessor_receipt) = predecessor_receipt.as_ref() else {
                    return Err(LocalLogStorageSelectedBindingError::MissingPredecessor);
                };
                if checkpoint_generation.state()
                    == LocalLogStorageSelectedCheckpointGenerationState::CheckpointOnly
                {
                    return Err(LocalLogStorageSelectedBindingError::CheckpointStateMismatch {
                        selection_kind: LocalLogStorageSelectionKind::Rotation,
                        checkpoint_state: checkpoint_generation.state(),
                    });
                }

                validate_predecessor(&current_receipt, predecessor_receipt)?;

                if current_receipt.expected_head_id()
                    != Some(predecessor_receipt.committed_head_id())
                {
                    return Err(LocalLogStorageSelectedBindingError::ExpectedHeadMismatch);
                }
                if current_receipt.transaction_id() == predecessor_receipt.transaction_id() {
                    return Err(LocalLogStorageSelectedBindingError::TransactionIdReused);
                }
                if predecessor_receipt.selection_kind() == LocalLogStorageSelectionKind::Rotation
                    && predecessor_receipt.expected_head_id()
                        == Some(current_receipt.committed_head_id())
                {
                    return Err(LocalLogStorageSelectedBindingError::KnownHeadIdReused);
                }
                if checkpoint_generation.activated_by_head_id()
                    != current_receipt.expected_head_id()
                {
                    return Err(LocalLogStorageSelectedBindingError::GenerationMismatch {
                        field: LocalLogStorageSelectedGenerationMismatchField::CheckpointActivatedByHeadId,
                    });
                }
                if checkpoint_generation.retired_by_head_id()
                    != Some(current_receipt.committed_head_id())
                {
                    return Err(LocalLogStorageSelectedBindingError::GenerationMismatch {
                        field: LocalLogStorageSelectedGenerationMismatchField::CheckpointRetiredByHeadId,
                    });
                }
            }
        }

        if checkpoint_generation.session_id() != current_receipt.session_id() {
            return Err(LocalLogStorageSelectedBindingError::GenerationMismatch {
                field: LocalLogStorageSelectedGenerationMismatchField::CheckpointSessionId,
            });
        }
        if active_generation.session_id() != current_receipt.session_id() {
            return Err(LocalLogStorageSelectedBindingError::GenerationMismatch {
                field: LocalLogStorageSelectedGenerationMismatchField::ActiveSessionId,
            });
        }
        if active_generation.activated_by_head_id() != current_receipt.committed_head_id() {
            return Err(LocalLogStorageSelectedBindingError::GenerationMismatch {
                field: LocalLogStorageSelectedGenerationMismatchField::ActiveActivatedByHeadId,
            });
        }
        if checkpoint_generation
            .activated_fence_id()
            .is_some_and(|fence_id| fence_id == active_generation.activated_fence_id())
        {
            return Err(LocalLogStorageSelectedBindingError::ActivationFenceReused);
        }
        if checkpoint_generation.log_id() == active_generation.log_id() {
            return Err(LocalLogStorageSelectedBindingError::GenerationNotAdvanced);
        }

        Ok(Self { current_receipt, predecessor_receipt, checkpoint_generation, active_generation })
    }

    /// Returns the exact independently trusted current receipt binding.
    #[must_use]
    pub const fn current_receipt(&self) -> &LocalLogStorageSelectionReceiptBinding {
        &self.current_receipt
    }

    /// Returns the exact predecessor receipt, present only for a rotation.
    #[must_use]
    pub const fn predecessor_receipt(&self) -> Option<&LocalLogStorageSelectionReceiptBinding> {
        self.predecessor_receipt.as_ref()
    }

    /// Returns the trusted checkpoint generation-record facts.
    #[must_use]
    pub const fn checkpoint_generation(
        &self,
    ) -> &LocalLogStorageSelectedCheckpointGenerationBinding {
        &self.checkpoint_generation
    }

    /// Returns the trusted active generation-record facts.
    #[must_use]
    pub const fn active_generation(&self) -> &LocalLogStorageSelectedActiveGenerationBinding {
        &self.active_generation
    }
}

fn validate_predecessor(
    current: &LocalLogStorageSelectionReceiptBinding,
    predecessor: &LocalLogStorageSelectionReceiptBinding,
) -> Result<(), LocalLogStorageSelectedBindingError> {
    let field = if current.profile_id() != predecessor.profile_id() {
        Some(LocalLogStorageSelectedReceiptMismatchField::ProfileId)
    } else if current.profile_version() != predecessor.profile_version() {
        Some(LocalLogStorageSelectedReceiptMismatchField::ProfileVersion)
    } else if current.database_incarnation_id() != predecessor.database_incarnation_id() {
        Some(LocalLogStorageSelectedReceiptMismatchField::DatabaseIncarnationId)
    } else if current.scope_id() != predecessor.scope_id() {
        Some(LocalLogStorageSelectedReceiptMismatchField::ScopeId)
    } else if current.scope_incarnation_id() != predecessor.scope_incarnation_id() {
        Some(LocalLogStorageSelectedReceiptMismatchField::ScopeIncarnationId)
    } else if current.session_id() != predecessor.session_id() {
        Some(LocalLogStorageSelectedReceiptMismatchField::SessionId)
    } else {
        None
    };

    match field {
        Some(field) => Err(LocalLogStorageSelectedBindingError::PredecessorMismatch { field }),
        None => Ok(()),
    }
}

#[cfg(test)]
mod tests {
    use super::{
        LocalLogStorageSelectedActiveGenerationBinding, LocalLogStorageSelectedBinding,
        LocalLogStorageSelectedBindingError, LocalLogStorageSelectedBindingErrorCode,
        LocalLogStorageSelectedCheckpointGenerationBinding,
        LocalLogStorageSelectedGenerationMismatchField,
        LocalLogStorageSelectedReceiptMismatchField, LocalLogStorageSelectionKind,
        LocalLogStorageSelectionReceiptBinding,
    };
    use crate::{
        codec::{LocalLogFrameLimits, LocalLogStorageGenerationFrameV1},
        local_log::{
            LocalLogId, LocalLogStorageDatabaseIncarnationId, LocalLogStorageFenceId,
            LocalLogStorageHeadId, LocalLogStorageProfileId, LocalLogStorageProfileVersion,
            LocalLogStorageScopeId, LocalLogStorageScopeIncarnationId,
            LocalLogStorageTransactionId, LocalSessionId,
        },
    };

    fn receipt(
        kind: LocalLogStorageSelectionKind,
        transaction_id: &str,
        expected_head_id: Option<&str>,
        committed_head_id: &str,
        session_id: &str,
    ) -> Result<LocalLogStorageSelectionReceiptBinding, Box<dyn std::error::Error>> {
        Ok(LocalLogStorageSelectionReceiptBinding::try_new(
            LocalLogStorageProfileId::try_new("breditor/test-storage")?,
            LocalLogStorageProfileVersion::try_new(1)?,
            LocalLogStorageDatabaseIncarnationId::try_new("database:test")?,
            LocalLogStorageScopeId::try_new("scope:test")?,
            LocalLogStorageScopeIncarnationId::try_new("scope-incarnation:test")?,
            LocalLogStorageTransactionId::try_new(transaction_id)?,
            expected_head_id.map(LocalLogStorageHeadId::try_new).transpose()?,
            LocalLogStorageHeadId::try_new(committed_head_id)?,
            kind,
            LocalSessionId::try_new(session_id)?,
        )?)
    }

    fn active(
        log_id: &str,
        head_id: &str,
        session_id: &str,
    ) -> Result<LocalLogStorageSelectedActiveGenerationBinding, Box<dyn std::error::Error>> {
        Ok(LocalLogStorageSelectedActiveGenerationBinding::new(
            LocalLogId::try_new(log_id)?,
            LocalSessionId::try_new(session_id)?,
            LocalLogStorageGenerationFrameV1::new(LocalLogFrameLimits::new(8_192)),
            LocalLogStorageFenceId::try_new("fence:active")?,
            LocalLogStorageHeadId::try_new(head_id)?,
        ))
    }

    #[test]
    fn root_requires_checkpoint_only_without_a_predecessor()
    -> Result<(), Box<dyn std::error::Error>> {
        let current = receipt(
            LocalLogStorageSelectionKind::Root,
            "transaction:root",
            None,
            "head:root",
            "session:test",
        )?;
        let checkpoint = LocalLogStorageSelectedCheckpointGenerationBinding::checkpoint_only(
            LocalLogId::try_new("log:checkpoint")?,
            LocalSessionId::try_new("session:test")?,
            LocalLogStorageHeadId::try_new("head:root")?,
        );
        let binding = LocalLogStorageSelectedBinding::try_new(
            current,
            None,
            checkpoint,
            active("log:active", "head:root", "session:test")?,
        )?;

        assert_eq!(binding.predecessor_receipt(), None);
        assert_eq!(binding.checkpoint_generation().log_id().as_str(), "log:checkpoint");
        assert_eq!(binding.active_generation().log_id().as_str(), "log:active");
        Ok(())
    }

    #[test]
    fn rotation_requires_exact_receipt_and_generation_head_continuity()
    -> Result<(), Box<dyn std::error::Error>> {
        let predecessor = receipt(
            LocalLogStorageSelectionKind::Root,
            "transaction:root",
            None,
            "head:old",
            "session:test",
        )?;
        let current = receipt(
            LocalLogStorageSelectionKind::Rotation,
            "transaction:rotation",
            Some("head:old"),
            "head:new",
            "session:test",
        )?;
        let checkpoint = LocalLogStorageSelectedCheckpointGenerationBinding::reclaimed(
            LocalLogId::try_new("log:old-active")?,
            LocalSessionId::try_new("session:test")?,
            LocalLogStorageGenerationFrameV1::new(LocalLogFrameLimits::new(4_096)),
            LocalLogStorageFenceId::try_new("fence:old")?,
            LocalLogStorageHeadId::try_new("head:old")?,
            LocalLogStorageHeadId::try_new("head:new")?,
        );
        let binding = LocalLogStorageSelectedBinding::try_new(
            current,
            Some(predecessor),
            checkpoint,
            active("log:new-active", "head:new", "session:test")?,
        )?;

        assert_eq!(
            binding
                .predecessor_receipt()
                .map(LocalLogStorageSelectionReceiptBinding::committed_head_id)
                .map(LocalLogStorageHeadId::as_str),
            Some("head:old")
        );
        Ok(())
    }

    #[test]
    fn rejects_wrong_edge_shape_and_generation_facts() -> Result<(), Box<dyn std::error::Error>> {
        let root = receipt(
            LocalLogStorageSelectionKind::Root,
            "transaction:root",
            None,
            "head:root",
            "session:test",
        )?;
        let wrong_checkpoint = LocalLogStorageSelectedCheckpointGenerationBinding::retired(
            LocalLogId::try_new("log:old")?,
            LocalSessionId::try_new("session:test")?,
            LocalLogStorageGenerationFrameV1::new(LocalLogFrameLimits::new(1)),
            LocalLogStorageFenceId::try_new("fence:old")?,
            LocalLogStorageHeadId::try_new("head:old")?,
            LocalLogStorageHeadId::try_new("head:root")?,
        );
        assert!(matches!(
            LocalLogStorageSelectedBinding::try_new(
                root,
                None,
                wrong_checkpoint,
                active("log:active", "head:root", "session:test")?,
            ),
            Err(LocalLogStorageSelectedBindingError::CheckpointStateMismatch { .. })
        ));

        let current = receipt(
            LocalLogStorageSelectionKind::Rotation,
            "transaction:rotation",
            Some("head:old"),
            "head:new",
            "session:test",
        )?;
        let checkpoint = LocalLogStorageSelectedCheckpointGenerationBinding::retired(
            LocalLogId::try_new("log:old")?,
            LocalSessionId::try_new("session:test")?,
            LocalLogStorageGenerationFrameV1::new(LocalLogFrameLimits::new(1)),
            LocalLogStorageFenceId::try_new("fence:old")?,
            LocalLogStorageHeadId::try_new("head:old")?,
            LocalLogStorageHeadId::try_new("head:new")?,
        );
        assert_eq!(
            LocalLogStorageSelectedBinding::try_new(
                current,
                None,
                checkpoint,
                active("log:active", "head:new", "session:test")?,
            ),
            Err(LocalLogStorageSelectedBindingError::MissingPredecessor)
        );

        let current = receipt(
            LocalLogStorageSelectionKind::Root,
            "transaction:root",
            None,
            "head:root",
            "session:test",
        )?;
        let checkpoint = LocalLogStorageSelectedCheckpointGenerationBinding::checkpoint_only(
            LocalLogId::try_new("log:same")?,
            LocalSessionId::try_new("session:test")?,
            LocalLogStorageHeadId::try_new("head:root")?,
        );
        assert_eq!(
            LocalLogStorageSelectedBinding::try_new(
                current,
                None,
                checkpoint,
                active("log:same", "head:root", "session:test")?,
            ),
            Err(LocalLogStorageSelectedBindingError::GenerationNotAdvanced)
        );
        Ok(())
    }

    #[test]
    fn rejects_activation_fence_reuse_in_trusted_generation_facts()
    -> Result<(), Box<dyn std::error::Error>> {
        let predecessor = receipt(
            LocalLogStorageSelectionKind::Root,
            "transaction:root",
            None,
            "head:old",
            "session:test",
        )?;
        let current = receipt(
            LocalLogStorageSelectionKind::Rotation,
            "transaction:rotation",
            Some("head:old"),
            "head:new",
            "session:test",
        )?;
        let checkpoint = LocalLogStorageSelectedCheckpointGenerationBinding::retired(
            LocalLogId::try_new("log:old")?,
            LocalSessionId::try_new("session:test")?,
            LocalLogStorageGenerationFrameV1::new(LocalLogFrameLimits::new(1)),
            LocalLogStorageFenceId::try_new("fence:active")?,
            LocalLogStorageHeadId::try_new("head:old")?,
            LocalLogStorageHeadId::try_new("head:new")?,
        );

        assert_eq!(
            LocalLogStorageSelectedBinding::try_new(
                current,
                Some(predecessor),
                checkpoint,
                active("log:active", "head:new", "session:test")?,
            ),
            Err(LocalLogStorageSelectedBindingError::ActivationFenceReused)
        );
        Ok(())
    }

    #[test]
    fn mismatch_fields_and_error_codes_are_stable() {
        assert_eq!(
            LocalLogStorageSelectedReceiptMismatchField::DatabaseIncarnationId.as_str(),
            "databaseIncarnationId"
        );
        assert_eq!(
            LocalLogStorageSelectedGenerationMismatchField::ActiveActivatedByHeadId.as_str(),
            "active.activatedByHeadId"
        );
        assert_eq!(
            LocalLogStorageSelectedBindingError::ExpectedHeadMismatch.code(),
            LocalLogStorageSelectedBindingErrorCode::ExpectedHeadMismatch
        );
        assert_eq!(
            LocalLogStorageSelectedBindingErrorCode::GenerationMismatch.as_str(),
            "local_log_storage_selected_binding.generation_mismatch"
        );
        assert_eq!(
            LocalLogStorageSelectedBindingError::ActivationFenceReused.code(),
            LocalLogStorageSelectedBindingErrorCode::ActivationFenceReused
        );
        assert_eq!(
            LocalLogStorageSelectedBindingErrorCode::ActivationFenceReused.as_str(),
            "local_log_storage_selected_binding.activation_fence_reused"
        );
    }
}

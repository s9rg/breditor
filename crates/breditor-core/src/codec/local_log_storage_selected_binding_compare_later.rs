use super::{
    LocalLogStorageSelectedBinding, LocalLogStorageSelectedBindingChange,
    LocalLogStorageSelectedBindingObservationError,
    LocalLogStorageSelectedCheckpointGenerationBinding,
    LocalLogStorageSelectedCheckpointGenerationState,
};

impl LocalLogStorageSelectedBinding {
    /// Compares a later binding with this exact selected-envelope snapshot.
    ///
    /// Current and predecessor receipts, every immutable generation fact, and
    /// the active generation must remain exact. For a selected rotation, the
    /// checkpoint generation may additionally make the one profile-valid
    /// cleanup advance from `Retired` to `Reclaimed`. A reclaimed checkpoint
    /// can never regress. Root checkpoint-only state is immutable.
    ///
    /// This is a directional value comparison, not storage evidence. It does
    /// not prove that `observed` came from a serialized transaction, that the
    /// envelope is still selected, that its JSON bytes match, or that the
    /// caller has writer authority. Resolver code must establish those facts
    /// separately and compare the exact current/predecessor JSON values.
    ///
    /// Failure precedence is current receipt, predecessor receipt, immutable
    /// checkpoint facts, immutable active facts, then cleanup-state regression.
    ///
    /// # Errors
    ///
    /// Returns a payload-free mismatch if any immutable fact changes or a
    /// reclaimed checkpoint is later reported as retired.
    pub fn compare_later_observation(
        &self,
        observed: &Self,
    ) -> Result<LocalLogStorageSelectedBindingChange, LocalLogStorageSelectedBindingObservationError>
    {
        if self.current_receipt() != observed.current_receipt() {
            return Err(LocalLogStorageSelectedBindingObservationError::CurrentReceiptMismatch);
        }
        if self.predecessor_receipt() != observed.predecessor_receipt() {
            return Err(LocalLogStorageSelectedBindingObservationError::PredecessorReceiptMismatch);
        }
        if !checkpoint_immutable_facts_match(
            self.checkpoint_generation(),
            observed.checkpoint_generation(),
        ) {
            return Err(
                LocalLogStorageSelectedBindingObservationError::CheckpointGenerationMismatch,
            );
        }
        if self.active_generation() != observed.active_generation() {
            return Err(LocalLogStorageSelectedBindingObservationError::ActiveGenerationMismatch);
        }

        match (self.checkpoint_generation().state(), observed.checkpoint_generation().state()) {
            (expected, later) if expected == later => {
                Ok(LocalLogStorageSelectedBindingChange::Unchanged)
            }
            (
                LocalLogStorageSelectedCheckpointGenerationState::Retired,
                LocalLogStorageSelectedCheckpointGenerationState::Reclaimed,
            ) => Ok(LocalLogStorageSelectedBindingChange::CheckpointReclaimed),
            (
                LocalLogStorageSelectedCheckpointGenerationState::Reclaimed,
                LocalLogStorageSelectedCheckpointGenerationState::Retired,
            ) => Err(LocalLogStorageSelectedBindingObservationError::CheckpointStateRegression),
            _ => Err(LocalLogStorageSelectedBindingObservationError::CheckpointGenerationMismatch),
        }
    }
}

/// Compares one independently observed checkpoint record with an earlier
/// record for the same permanent generation identity.
///
/// This crate-private helper is intentionally narrower than selected-envelope
/// comparison: rotation resolution can observe a plan-known checkpoint after
/// it has left the current envelope. Immutable facts must remain exact and the
/// only accepted state change is cleanup from `Retired` to `Reclaimed`.
pub(super) fn checkpoint_generation_matches_later(
    expected: &LocalLogStorageSelectedCheckpointGenerationBinding,
    observed: &LocalLogStorageSelectedCheckpointGenerationBinding,
) -> bool {
    checkpoint_immutable_facts_match(expected, observed)
        && match (expected.state(), observed.state()) {
            (expected_state, observed_state) if expected_state == observed_state => true,
            (
                LocalLogStorageSelectedCheckpointGenerationState::Retired,
                LocalLogStorageSelectedCheckpointGenerationState::Reclaimed,
            ) => true,
            _ => false,
        }
}

fn checkpoint_immutable_facts_match(
    expected: &LocalLogStorageSelectedCheckpointGenerationBinding,
    observed: &LocalLogStorageSelectedCheckpointGenerationBinding,
) -> bool {
    expected.log_id() == observed.log_id()
        && expected.session_id() == observed.session_id()
        && expected.established_by_head_id() == observed.established_by_head_id()
        && expected.frame() == observed.frame()
        && expected.activated_fence_id() == observed.activated_fence_id()
        && expected.activated_by_head_id() == observed.activated_by_head_id()
        && expected.retired_by_head_id() == observed.retired_by_head_id()
}

#[cfg(test)]
mod tests {
    use super::{
        LocalLogStorageSelectedBinding, LocalLogStorageSelectedBindingChange,
        LocalLogStorageSelectedBindingObservationError,
        LocalLogStorageSelectedCheckpointGenerationBinding,
        LocalLogStorageSelectedCheckpointGenerationState,
    };
    use crate::{
        codec::{
            LocalLogFrameLimits, LocalLogStorageGenerationFrameV1,
            LocalLogStorageSelectedActiveGenerationBinding,
            LocalLogStorageSelectedBindingObservationErrorCode, LocalLogStorageSelectionKind,
            LocalLogStorageSelectionReceiptBinding,
        },
        local_log::{
            LocalLogId, LocalLogStorageDatabaseIncarnationId, LocalLogStorageFenceId,
            LocalLogStorageHeadId, LocalLogStorageProfileId, LocalLogStorageProfileVersion,
            LocalLogStorageScopeId, LocalLogStorageScopeIncarnationId,
            LocalLogStorageTransactionId, LocalSessionId,
        },
    };

    type TestResult<T = ()> = Result<T, Box<dyn std::error::Error>>;

    fn receipt(
        kind: LocalLogStorageSelectionKind,
        transaction_id: &str,
        expected_head_id: Option<&str>,
        committed_head_id: &str,
    ) -> TestResult<LocalLogStorageSelectionReceiptBinding> {
        Ok(LocalLogStorageSelectionReceiptBinding::try_new(
            LocalLogStorageProfileId::try_new("breditor/observation-tests")?,
            LocalLogStorageProfileVersion::try_new(1)?,
            LocalLogStorageDatabaseIncarnationId::try_new("database:observation-tests")?,
            LocalLogStorageScopeId::try_new("scope:observation-tests")?,
            LocalLogStorageScopeIncarnationId::try_new("scope-incarnation:observation-tests")?,
            LocalLogStorageTransactionId::try_new(transaction_id)?,
            expected_head_id.map(LocalLogStorageHeadId::try_new).transpose()?,
            LocalLogStorageHeadId::try_new(committed_head_id)?,
            kind,
            LocalSessionId::try_new("session:observation-tests")?,
        )?)
    }

    fn frame(max_payload_bytes: u64) -> LocalLogStorageGenerationFrameV1 {
        LocalLogStorageGenerationFrameV1::new(LocalLogFrameLimits::new(max_payload_bytes))
    }

    fn active(
        frame: LocalLogStorageGenerationFrameV1,
    ) -> TestResult<LocalLogStorageSelectedActiveGenerationBinding> {
        Ok(LocalLogStorageSelectedActiveGenerationBinding::new(
            LocalLogId::try_new("log:active")?,
            LocalSessionId::try_new("session:observation-tests")?,
            frame,
            LocalLogStorageFenceId::try_new("fence:active")?,
            LocalLogStorageHeadId::try_new("head:current")?,
        ))
    }

    fn root_binding() -> TestResult<LocalLogStorageSelectedBinding> {
        Ok(LocalLogStorageSelectedBinding::try_new(
            receipt(LocalLogStorageSelectionKind::Root, "transaction:root", None, "head:current")?,
            None,
            LocalLogStorageSelectedCheckpointGenerationBinding::checkpoint_only(
                LocalLogId::try_new("log:checkpoint")?,
                LocalSessionId::try_new("session:observation-tests")?,
                LocalLogStorageHeadId::try_new("head:current")?,
            ),
            active(frame(8_192))?,
        )?)
    }

    fn rotation_binding(
        state: LocalLogStorageSelectedCheckpointGenerationState,
        current_transaction_id: &str,
        predecessor_transaction_id: &str,
        checkpoint_frame: LocalLogStorageGenerationFrameV1,
        active_frame: LocalLogStorageGenerationFrameV1,
    ) -> TestResult<LocalLogStorageSelectedBinding> {
        let checkpoint = match state {
            LocalLogStorageSelectedCheckpointGenerationState::Retired => {
                LocalLogStorageSelectedCheckpointGenerationBinding::retired(
                    LocalLogId::try_new("log:checkpoint")?,
                    LocalSessionId::try_new("session:observation-tests")?,
                    checkpoint_frame,
                    LocalLogStorageFenceId::try_new("fence:checkpoint")?,
                    LocalLogStorageHeadId::try_new("head:previous")?,
                    LocalLogStorageHeadId::try_new("head:current")?,
                )
            }
            LocalLogStorageSelectedCheckpointGenerationState::Reclaimed => {
                LocalLogStorageSelectedCheckpointGenerationBinding::reclaimed(
                    LocalLogId::try_new("log:checkpoint")?,
                    LocalSessionId::try_new("session:observation-tests")?,
                    checkpoint_frame,
                    LocalLogStorageFenceId::try_new("fence:checkpoint")?,
                    LocalLogStorageHeadId::try_new("head:previous")?,
                    LocalLogStorageHeadId::try_new("head:current")?,
                )
            }
            LocalLogStorageSelectedCheckpointGenerationState::CheckpointOnly => {
                return Err("rotation cannot use checkpoint-only state".into());
            }
        };

        Ok(LocalLogStorageSelectedBinding::try_new(
            receipt(
                LocalLogStorageSelectionKind::Rotation,
                current_transaction_id,
                Some("head:previous"),
                "head:current",
            )?,
            Some(receipt(
                LocalLogStorageSelectionKind::Root,
                predecessor_transaction_id,
                None,
                "head:previous",
            )?),
            checkpoint,
            active(active_frame)?,
        )?)
    }

    fn rotation(
        state: LocalLogStorageSelectedCheckpointGenerationState,
    ) -> TestResult<LocalLogStorageSelectedBinding> {
        rotation_binding(
            state,
            "transaction:rotation",
            "transaction:root",
            frame(8_192),
            frame(8_192),
        )
    }

    #[derive(Clone, Copy)]
    struct RotationFacts {
        profile_id: &'static str,
        profile_version: u32,
        database_incarnation_id: &'static str,
        scope_id: &'static str,
        scope_incarnation_id: &'static str,
        current_transaction_id: &'static str,
        predecessor_transaction_id: &'static str,
        predecessor_kind: LocalLogStorageSelectionKind,
        predecessor_expected_head_id: Option<&'static str>,
        previous_head_id: &'static str,
        current_head_id: &'static str,
        session_id: &'static str,
        checkpoint_log_id: &'static str,
        checkpoint_frame_bytes: u64,
        checkpoint_fence_id: &'static str,
        active_log_id: &'static str,
        active_frame_bytes: u64,
        active_fence_id: &'static str,
    }

    impl RotationFacts {
        const fn standard() -> Self {
            Self {
                profile_id: "breditor/observation-tests",
                profile_version: 1,
                database_incarnation_id: "database:observation-tests",
                scope_id: "scope:observation-tests",
                scope_incarnation_id: "scope-incarnation:observation-tests",
                current_transaction_id: "transaction:rotation",
                predecessor_transaction_id: "transaction:root",
                predecessor_kind: LocalLogStorageSelectionKind::Root,
                predecessor_expected_head_id: None,
                previous_head_id: "head:previous",
                current_head_id: "head:current",
                session_id: "session:observation-tests",
                checkpoint_log_id: "log:checkpoint",
                checkpoint_frame_bytes: 8_192,
                checkpoint_fence_id: "fence:checkpoint",
                active_log_id: "log:active",
                active_frame_bytes: 8_192,
                active_fence_id: "fence:active",
            }
        }
    }

    fn contextual_receipt(
        facts: RotationFacts,
        kind: LocalLogStorageSelectionKind,
        transaction_id: &str,
        expected_head_id: Option<&str>,
        committed_head_id: &str,
    ) -> TestResult<LocalLogStorageSelectionReceiptBinding> {
        Ok(LocalLogStorageSelectionReceiptBinding::try_new(
            LocalLogStorageProfileId::try_new(facts.profile_id)?,
            LocalLogStorageProfileVersion::try_new(facts.profile_version)?,
            LocalLogStorageDatabaseIncarnationId::try_new(facts.database_incarnation_id)?,
            LocalLogStorageScopeId::try_new(facts.scope_id)?,
            LocalLogStorageScopeIncarnationId::try_new(facts.scope_incarnation_id)?,
            LocalLogStorageTransactionId::try_new(transaction_id)?,
            expected_head_id.map(LocalLogStorageHeadId::try_new).transpose()?,
            LocalLogStorageHeadId::try_new(committed_head_id)?,
            kind,
            LocalSessionId::try_new(facts.session_id)?,
        )?)
    }

    fn contextual_rotation(facts: RotationFacts) -> TestResult<LocalLogStorageSelectedBinding> {
        let current = contextual_receipt(
            facts,
            LocalLogStorageSelectionKind::Rotation,
            facts.current_transaction_id,
            Some(facts.previous_head_id),
            facts.current_head_id,
        )?;
        let predecessor = contextual_receipt(
            facts,
            facts.predecessor_kind,
            facts.predecessor_transaction_id,
            facts.predecessor_expected_head_id,
            facts.previous_head_id,
        )?;
        let checkpoint = LocalLogStorageSelectedCheckpointGenerationBinding::retired(
            LocalLogId::try_new(facts.checkpoint_log_id)?,
            LocalSessionId::try_new(facts.session_id)?,
            frame(facts.checkpoint_frame_bytes),
            LocalLogStorageFenceId::try_new(facts.checkpoint_fence_id)?,
            LocalLogStorageHeadId::try_new(facts.previous_head_id)?,
            LocalLogStorageHeadId::try_new(facts.current_head_id)?,
        );
        let active = LocalLogStorageSelectedActiveGenerationBinding::new(
            LocalLogId::try_new(facts.active_log_id)?,
            LocalSessionId::try_new(facts.session_id)?,
            frame(facts.active_frame_bytes),
            LocalLogStorageFenceId::try_new(facts.active_fence_id)?,
            LocalLogStorageHeadId::try_new(facts.current_head_id)?,
        );

        Ok(LocalLogStorageSelectedBinding::try_new(current, Some(predecessor), checkpoint, active)?)
    }

    fn contextual_root(
        checkpoint_log_id: &str,
        active_log_id: &str,
        active_fence_id: &str,
    ) -> TestResult<LocalLogStorageSelectedBinding> {
        Ok(LocalLogStorageSelectedBinding::try_new(
            receipt(LocalLogStorageSelectionKind::Root, "transaction:root", None, "head:current")?,
            None,
            LocalLogStorageSelectedCheckpointGenerationBinding::checkpoint_only(
                LocalLogId::try_new(checkpoint_log_id)?,
                LocalSessionId::try_new("session:observation-tests")?,
                LocalLogStorageHeadId::try_new("head:current")?,
            ),
            LocalLogStorageSelectedActiveGenerationBinding::new(
                LocalLogId::try_new(active_log_id)?,
                LocalSessionId::try_new("session:observation-tests")?,
                frame(8_192),
                LocalLogStorageFenceId::try_new(active_fence_id)?,
                LocalLogStorageHeadId::try_new("head:current")?,
            ),
        )?)
    }

    #[test]
    fn exact_root_and_rotation_bindings_are_unchanged() -> TestResult {
        for binding in [
            root_binding()?,
            rotation(LocalLogStorageSelectedCheckpointGenerationState::Retired)?,
            rotation(LocalLogStorageSelectedCheckpointGenerationState::Reclaimed)?,
        ] {
            assert_eq!(
                binding.compare_later_observation(&binding)?,
                LocalLogStorageSelectedBindingChange::Unchanged
            );
        }
        Ok(())
    }

    #[test]
    fn retired_to_reclaimed_is_the_only_accepted_forward_change() -> TestResult {
        let retired = rotation(LocalLogStorageSelectedCheckpointGenerationState::Retired)?;
        let reclaimed = rotation(LocalLogStorageSelectedCheckpointGenerationState::Reclaimed)?;

        assert_eq!(
            retired.compare_later_observation(&reclaimed)?,
            LocalLogStorageSelectedBindingChange::CheckpointReclaimed
        );
        assert_eq!(
            reclaimed.compare_later_observation(&retired),
            Err(LocalLogStorageSelectedBindingObservationError::CheckpointStateRegression)
        );
        Ok(())
    }

    #[test]
    fn every_immutable_envelope_layer_fails_with_stable_precedence() -> TestResult {
        let expected = rotation(LocalLogStorageSelectedCheckpointGenerationState::Reclaimed)?;
        let current_mismatch = rotation_binding(
            LocalLogStorageSelectedCheckpointGenerationState::Retired,
            "transaction:other-rotation",
            "transaction:other-root",
            frame(4_096),
            frame(4_096),
        )?;
        assert_eq!(
            expected.compare_later_observation(&current_mismatch),
            Err(LocalLogStorageSelectedBindingObservationError::CurrentReceiptMismatch)
        );

        let predecessor_mismatch = rotation_binding(
            LocalLogStorageSelectedCheckpointGenerationState::Retired,
            "transaction:rotation",
            "transaction:other-root",
            frame(4_096),
            frame(4_096),
        )?;
        assert_eq!(
            expected.compare_later_observation(&predecessor_mismatch),
            Err(LocalLogStorageSelectedBindingObservationError::PredecessorReceiptMismatch)
        );

        let checkpoint_mismatch = rotation_binding(
            LocalLogStorageSelectedCheckpointGenerationState::Retired,
            "transaction:rotation",
            "transaction:root",
            frame(4_096),
            frame(4_096),
        )?;
        assert_eq!(
            expected.compare_later_observation(&checkpoint_mismatch),
            Err(LocalLogStorageSelectedBindingObservationError::CheckpointGenerationMismatch)
        );

        let active_mismatch = rotation_binding(
            LocalLogStorageSelectedCheckpointGenerationState::Retired,
            "transaction:rotation",
            "transaction:root",
            frame(8_192),
            frame(4_096),
        )?;
        assert_eq!(
            expected.compare_later_observation(&active_mismatch),
            Err(LocalLogStorageSelectedBindingObservationError::ActiveGenerationMismatch)
        );
        Ok(())
    }

    #[test]
    fn every_independently_variable_current_receipt_fact_is_compared() -> TestResult {
        let standard = RotationFacts::standard();
        let expected = contextual_rotation(standard)?;
        let changed = [
            RotationFacts { profile_id: "breditor/other-profile", ..standard },
            RotationFacts { profile_version: 2, ..standard },
            RotationFacts { database_incarnation_id: "database:other", ..standard },
            RotationFacts { scope_id: "scope:other", ..standard },
            RotationFacts { scope_incarnation_id: "scope-incarnation:other", ..standard },
            RotationFacts { current_transaction_id: "transaction:other", ..standard },
            RotationFacts { previous_head_id: "head:other-previous", ..standard },
            RotationFacts { current_head_id: "head:other-current", ..standard },
            RotationFacts { session_id: "session:other", ..standard },
        ];

        for facts in changed {
            assert_eq!(
                expected.compare_later_observation(&contextual_rotation(facts)?),
                Err(LocalLogStorageSelectedBindingObservationError::CurrentReceiptMismatch)
            );
        }
        assert_eq!(
            expected.compare_later_observation(&root_binding()?),
            Err(LocalLogStorageSelectedBindingObservationError::CurrentReceiptMismatch)
        );
        Ok(())
    }

    #[test]
    fn predecessor_transaction_kind_and_expected_head_are_compared() -> TestResult {
        let standard = RotationFacts::standard();
        let expected = contextual_rotation(standard)?;
        assert_eq!(
            expected.compare_later_observation(&contextual_rotation(RotationFacts {
                predecessor_transaction_id: "transaction:other-predecessor",
                ..standard
            })?),
            Err(LocalLogStorageSelectedBindingObservationError::PredecessorReceiptMismatch)
        );
        assert_eq!(
            expected.compare_later_observation(&contextual_rotation(RotationFacts {
                predecessor_kind: LocalLogStorageSelectionKind::Rotation,
                predecessor_expected_head_id: Some("head:older"),
                ..standard
            })?),
            Err(LocalLogStorageSelectedBindingObservationError::PredecessorReceiptMismatch)
        );

        let rotation_predecessor = RotationFacts {
            predecessor_kind: LocalLogStorageSelectionKind::Rotation,
            predecessor_expected_head_id: Some("head:older-a"),
            ..standard
        };
        let expected = contextual_rotation(rotation_predecessor)?;
        assert_eq!(
            expected.compare_later_observation(&contextual_rotation(RotationFacts {
                predecessor_expected_head_id: Some("head:older-b"),
                ..rotation_predecessor
            })?),
            Err(LocalLogStorageSelectedBindingObservationError::PredecessorReceiptMismatch)
        );
        Ok(())
    }

    #[test]
    fn every_independently_variable_generation_fact_is_compared() -> TestResult {
        let standard = RotationFacts::standard();
        let expected = contextual_rotation(standard)?;

        for facts in [
            RotationFacts { checkpoint_log_id: "log:other-checkpoint", ..standard },
            RotationFacts { checkpoint_frame_bytes: 4_096, ..standard },
            RotationFacts { checkpoint_fence_id: "fence:other-checkpoint", ..standard },
        ] {
            assert_eq!(
                expected.compare_later_observation(&contextual_rotation(facts)?),
                Err(LocalLogStorageSelectedBindingObservationError::CheckpointGenerationMismatch)
            );
        }
        for facts in [
            RotationFacts { active_log_id: "log:other-active", ..standard },
            RotationFacts { active_frame_bytes: 4_096, ..standard },
            RotationFacts { active_fence_id: "fence:other-active", ..standard },
        ] {
            assert_eq!(
                expected.compare_later_observation(&contextual_rotation(facts)?),
                Err(LocalLogStorageSelectedBindingObservationError::ActiveGenerationMismatch)
            );
        }

        let root = contextual_root("log:checkpoint", "log:active", "fence:active")?;
        assert_eq!(
            root.compare_later_observation(&contextual_root(
                "log:other-checkpoint",
                "log:active",
                "fence:active",
            )?),
            Err(LocalLogStorageSelectedBindingObservationError::CheckpointGenerationMismatch)
        );
        assert_eq!(
            root.compare_later_observation(&contextual_root(
                "log:checkpoint",
                "log:other-active",
                "fence:active",
            )?),
            Err(LocalLogStorageSelectedBindingObservationError::ActiveGenerationMismatch)
        );
        assert_eq!(
            root.compare_later_observation(&contextual_root(
                "log:checkpoint",
                "log:active",
                "fence:other-active",
            )?),
            Err(LocalLogStorageSelectedBindingObservationError::ActiveGenerationMismatch)
        );
        Ok(())
    }

    #[test]
    fn change_names_and_error_codes_are_stable_and_payload_free() {
        assert_eq!(LocalLogStorageSelectedBindingChange::Unchanged.as_str(), "unchanged");
        assert_eq!(
            LocalLogStorageSelectedBindingChange::CheckpointReclaimed.as_str(),
            "checkpoint_reclaimed"
        );

        for (error, expected, expected_code) in [
            (
                LocalLogStorageSelectedBindingObservationError::CurrentReceiptMismatch,
                LocalLogStorageSelectedBindingObservationErrorCode::CurrentReceiptMismatch,
                "local_log_storage_selected_binding_observation.current_receipt_mismatch",
            ),
            (
                LocalLogStorageSelectedBindingObservationError::PredecessorReceiptMismatch,
                LocalLogStorageSelectedBindingObservationErrorCode::PredecessorReceiptMismatch,
                "local_log_storage_selected_binding_observation.predecessor_receipt_mismatch",
            ),
            (
                LocalLogStorageSelectedBindingObservationError::CheckpointGenerationMismatch,
                LocalLogStorageSelectedBindingObservationErrorCode::CheckpointGenerationMismatch,
                "local_log_storage_selected_binding_observation.checkpoint_generation_mismatch",
            ),
            (
                LocalLogStorageSelectedBindingObservationError::ActiveGenerationMismatch,
                LocalLogStorageSelectedBindingObservationErrorCode::ActiveGenerationMismatch,
                "local_log_storage_selected_binding_observation.active_generation_mismatch",
            ),
            (
                LocalLogStorageSelectedBindingObservationError::CheckpointStateRegression,
                LocalLogStorageSelectedBindingObservationErrorCode::CheckpointStateRegression,
                "local_log_storage_selected_binding_observation.checkpoint_state_regression",
            ),
        ] {
            assert_eq!(error.code(), expected);
            assert_eq!(error.code().as_str(), expected_code);
            assert!(!format!("{error:?} {error}").contains("PAYLOADSENTINEL"));
        }
    }
}

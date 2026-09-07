use super::{
    LocalLogStorageAttemptPreparationError, LocalLogStorageGenerationJsonCodec,
    LocalLogStorageGenerationManifest, LocalLogStoragePreparedAttempt,
    LocalLogStorageSelectedActiveGenerationBinding, LocalLogStorageSelectedBinding,
    LocalLogStorageSelectedCheckpointGenerationBinding, LocalLogStorageSelectedJsonCodec,
    LocalLogStorageSelectedRoot, LocalLogStorageSelectionKind,
    LocalLogStorageSelectionReceiptBinding,
    local_log_storage_attempt_plan::LocalLogStorageAttemptPlan,
};

impl LocalLogStorageGenerationJsonCodec {
    /// Closes one checked rotation and exact selected envelope into an attempt plan.
    ///
    /// This action revalidates and canonical-encodes the borrowed candidate
    /// against the normalized selected root. The closed plan copies the complete
    /// candidate facts and shares the selected binding plus exact current and
    /// optional predecessor JSON. A final strict candidate normalization
    /// reconstructs and immediately drops its anchor. The plan does not retain
    /// either selected root or checkpoint anchor.
    ///
    /// Database and scope incarnations are derived only from the selected
    /// envelope. Success performs no I/O and proves no currentness, reservation,
    /// writer authority, dispatch, commit, or durability. Both borrowed inputs
    /// remain reusable and can prepare an equivalent plan.
    ///
    /// # Errors
    ///
    /// Returns a payload-free [`LocalLogStorageAttemptPreparationError`] when
    /// candidate encoding, binding closure, or final normalization fails. Final
    /// normalization applies the codec's input limit as well as its output and
    /// nested-checkpoint limits.
    pub fn prepare_rotation_attempt(
        &self,
        selected: &LocalLogStorageSelectedRoot,
        manifest: &LocalLogStorageGenerationManifest,
    ) -> Result<LocalLogStoragePreparedAttempt, LocalLogStorageAttemptPreparationError> {
        crate::schema::require_exact_breditor_base(self.context().schema()).map_err(|_| {
            LocalLogStorageAttemptPreparationError::InvalidCandidate {
                kind: LocalLogStorageSelectionKind::Rotation,
                code: crate::codec::CodecErrorCode::ContextMismatch,
            }
        })?;
        let candidate_json =
            self.encode_rotation_from_selected(manifest, selected).map_err(|error| {
                LocalLogStorageAttemptPreparationError::InvalidCandidate {
                    kind: LocalLogStorageSelectionKind::Rotation,
                    code: error.code(),
                }
            })?;
        let candidate_receipt = LocalLogStorageSelectionReceiptBinding::try_new(
            manifest.profile_id().clone(),
            manifest.profile_version(),
            selected.database_incarnation_id().clone(),
            manifest.scope_id().clone(),
            selected.scope_incarnation_id().clone(),
            manifest.transaction_id().clone(),
            Some(manifest.expected_head_id().clone()),
            manifest.committed_head_id().clone(),
            LocalLogStorageSelectionKind::Rotation,
            manifest.session_id().clone(),
        )
        .map_err(|error| {
            LocalLogStorageAttemptPreparationError::InvalidCandidateReceipt {
                kind: LocalLogStorageSelectionKind::Rotation,
                code: error.code(),
            }
        })?;
        let candidate_binding = LocalLogStorageSelectedBinding::try_new(
            candidate_receipt,
            Some(selected.current_receipt().clone()),
            LocalLogStorageSelectedCheckpointGenerationBinding::retired(
                selected.active_log_id().clone(),
                manifest.session_id().clone(),
                selected.active_frame(),
                selected.activation_fence_id().clone(),
                selected.selected_head_id().clone(),
                manifest.committed_head_id().clone(),
            ),
            LocalLogStorageSelectedActiveGenerationBinding::new(
                manifest.successor_log_id().clone(),
                manifest.session_id().clone(),
                manifest.successor_frame(),
                manifest.fence_id().clone(),
                manifest.committed_head_id().clone(),
            ),
        )
        .map_err(|error| {
            LocalLogStorageAttemptPreparationError::InvalidCandidateBinding {
                kind: LocalLogStorageSelectionKind::Rotation,
                code: error.code(),
            }
        })?;
        let normalized_candidate =
            LocalLogStorageSelectedJsonCodec::new(self.context().clone(), candidate_binding)
                .with_limits(*self.limits())
                .normalize_rotation(&candidate_json, selected.current_selection_json())
                .map_err(|error| {
                    LocalLogStorageAttemptPreparationError::InvalidCandidateEnvelope {
                        kind: LocalLogStorageSelectionKind::Rotation,
                        code: error.code(),
                    }
                })?;
        Ok(LocalLogStoragePreparedAttempt::new(LocalLogStorageAttemptPlan::rotation(
            normalized_candidate,
            selected,
        )?))
    }
}

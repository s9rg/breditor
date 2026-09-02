use super::{
    LocalLogStorageSelectedJsonCodec, LocalLogStorageSelectedRoot,
    LocalLogStorageSelectedRootError, LocalLogStorageSelectedRootGenerationField,
    LocalLogStorageSelectedRootParts, LocalLogStorageSelectedRootValueRole,
    LocalLogStorageSelectionKind, local_log_storage_selected_json::validate_receipt_assertions,
};

impl LocalLogStorageSelectedJsonCodec {
    /// Strictly normalizes one canonical selected root against all trusted
    /// receipt and generation facts.
    ///
    /// Routing comes only from the independently supplied current receipt.
    /// Successful normalization privately quarantines the decoded checkpoint
    /// anchor but performs no storage I/O, current-head attestation, commit
    /// decision, or writer authorization.
    ///
    /// # Errors
    ///
    /// Returns [`LocalLogStorageSelectedRootError`] when this action is used for
    /// a rotation receipt, strict root decode fails, a decoded receipt or
    /// generation assertion disagrees, or the checkpoint anchor cannot be
    /// reconstructed under the same context and limits.
    pub fn normalize_root(
        &self,
        json: &str,
    ) -> Result<LocalLogStorageSelectedRoot, LocalLogStorageSelectedRootError> {
        self.require_current_kind(LocalLogStorageSelectionKind::Root)?;

        let receipt = self.binding().current_receipt();
        let selection = self.root_codec_for(receipt).decode_root(json).map_err(|error| {
            LocalLogStorageSelectedRootError::InvalidSelection {
                role: LocalLogStorageSelectedRootValueRole::Current,
                selection_kind: LocalLogStorageSelectionKind::Root,
                code: error.code(),
            }
        })?;

        validate_receipt_assertions(
            LocalLogStorageSelectedRootValueRole::Current,
            receipt,
            selection.transaction_id(),
            selection.session_id(),
        )?;

        let checkpoint = self.binding().checkpoint_generation();
        let active = self.binding().active_generation();
        if selection.checkpoint_log_id() != checkpoint.log_id() {
            return Err(generation_mismatch(
                LocalLogStorageSelectedRootGenerationField::CheckpointLogId,
            ));
        }
        if selection.active_log_id() != active.log_id() {
            return Err(generation_mismatch(
                LocalLogStorageSelectedRootGenerationField::ActiveLogId,
            ));
        }
        if selection.active_frame() != active.frame() {
            return Err(generation_mismatch(
                LocalLogStorageSelectedRootGenerationField::ActiveFrame,
            ));
        }
        if selection.fence_id() != active.activated_fence_id() {
            return Err(generation_mismatch(
                LocalLogStorageSelectedRootGenerationField::ActivationFenceId,
            ));
        }

        let checkpoint_anchor = self.decode_checkpoint_anchor(
            receipt.session_id(),
            checkpoint.log_id(),
            active.log_id(),
            selection.checkpoint_json(),
        )?;

        Ok(LocalLogStorageSelectedRoot::from_parts(LocalLogStorageSelectedRootParts {
            profile_id: receipt.profile_id().clone(),
            profile_version: receipt.profile_version(),
            database_incarnation_id: receipt.database_incarnation_id().clone(),
            scope_id: receipt.scope_id().clone(),
            scope_incarnation_id: receipt.scope_incarnation_id().clone(),
            selected_head_id: receipt.committed_head_id().clone(),
            previous_head_id: None,
            selection_kind: LocalLogStorageSelectionKind::Root,
            transaction_id: receipt.transaction_id().clone(),
            activation_fence_id: active.activated_fence_id().clone(),
            session_id: receipt.session_id().clone(),
            checkpoint_log_id: checkpoint.log_id().clone(),
            active_log_id: active.log_id().clone(),
            active_frame: active.frame(),
            checkpoint_json: selection.checkpoint_json().to_owned(),
            checkpoint_anchor,
        }))
    }
}

const fn generation_mismatch(
    field: LocalLogStorageSelectedRootGenerationField,
) -> LocalLogStorageSelectedRootError {
    LocalLogStorageSelectedRootError::GenerationMismatch {
        role: LocalLogStorageSelectedRootValueRole::Current,
        field,
    }
}

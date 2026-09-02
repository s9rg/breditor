use crate::local_log::{LocalLogId, LocalLogStorageFenceId};

use super::{
    LocalLogStorageGenerationFrameV1, LocalLogStorageSelectedJsonCodec,
    LocalLogStorageSelectedRoot, LocalLogStorageSelectedRootError,
    LocalLogStorageSelectedRootGenerationField, LocalLogStorageSelectedRootParts,
    LocalLogStorageSelectedRootValueRole, LocalLogStorageSelectionKind,
    LocalLogStorageSelectionReceiptBinding,
    local_log_storage_selected_json::validate_receipt_assertions,
};

struct DecodedPredecessorActive {
    checkpoint_log_id: LocalLogId,
    log_id: LocalLogId,
    frame: LocalLogStorageGenerationFrameV1,
    activation_fence_id: LocalLogStorageFenceId,
}

impl LocalLogStorageSelectedJsonCodec {
    /// Strictly normalizes one canonical selected rotation and its one exact
    /// immediate predecessor against all trusted receipt and generation facts.
    ///
    /// The predecessor codec is selected solely from its independently trusted
    /// receipt kind. A rotation predecessor is intrinsically and fully bound
    /// decoded without requiring an older manifest. Both decoded payloads are
    /// discarded after the current checkpoint anchor is privately quarantined.
    ///
    /// # Errors
    ///
    /// Returns [`LocalLogStorageSelectedRootError`] when this action is used for
    /// a root receipt, either strict selection decode fails, receipt identity
    /// assertions disagree, generation/frame/fence cross-links are corrupt, or
    /// the current checkpoint anchor cannot be reconstructed.
    #[allow(clippy::too_many_lines)]
    pub fn normalize_rotation(
        &self,
        current_json: &str,
        predecessor_json: &str,
    ) -> Result<LocalLogStorageSelectedRoot, LocalLogStorageSelectedRootError> {
        self.require_current_kind(LocalLogStorageSelectionKind::Rotation)?;

        let current_receipt = self.binding().current_receipt();
        let current = self
            .generation_codec_for(current_receipt)?
            .decode_bound_rotation(current_json)
            .map_err(|error| LocalLogStorageSelectedRootError::InvalidSelection {
                role: LocalLogStorageSelectedRootValueRole::Current,
                selection_kind: LocalLogStorageSelectionKind::Rotation,
                code: error.code(),
            })?;
        validate_receipt_assertions(
            LocalLogStorageSelectedRootValueRole::Current,
            current_receipt,
            current.transaction_id(),
            current.session_id(),
        )?;

        let predecessor_receipt = self
            .binding()
            .predecessor_receipt()
            .ok_or(LocalLogStorageSelectedRootError::RuntimeInvariant)?;
        let predecessor = self.decode_predecessor_active(predecessor_receipt, predecessor_json)?;

        let checkpoint = self.binding().checkpoint_generation();
        let active = self.binding().active_generation();
        let checkpoint_frame =
            checkpoint.frame().ok_or(LocalLogStorageSelectedRootError::RuntimeInvariant)?;
        let checkpoint_fence = checkpoint
            .activated_fence_id()
            .ok_or(LocalLogStorageSelectedRootError::RuntimeInvariant)?;

        validate_generation(
            LocalLogStorageSelectedRootValueRole::Current,
            LocalLogStorageSelectedRootGenerationField::CheckpointLogId,
            current.sealed_log_id() == checkpoint.log_id(),
        )?;
        validate_generation(
            LocalLogStorageSelectedRootValueRole::Current,
            LocalLogStorageSelectedRootGenerationField::CheckpointFrame,
            current.sealed_frame() == checkpoint_frame,
        )?;
        validate_generation(
            LocalLogStorageSelectedRootValueRole::Current,
            LocalLogStorageSelectedRootGenerationField::ActiveLogId,
            current.successor_log_id() == active.log_id(),
        )?;
        validate_generation(
            LocalLogStorageSelectedRootValueRole::Current,
            LocalLogStorageSelectedRootGenerationField::ActiveFrame,
            current.successor_frame() == active.frame(),
        )?;
        validate_generation(
            LocalLogStorageSelectedRootValueRole::Current,
            LocalLogStorageSelectedRootGenerationField::ActivationFenceId,
            current.fence_id() == active.activated_fence_id(),
        )?;

        validate_generation(
            LocalLogStorageSelectedRootValueRole::Predecessor,
            LocalLogStorageSelectedRootGenerationField::ActiveLogId,
            &predecessor.log_id == checkpoint.log_id(),
        )?;
        validate_generation(
            LocalLogStorageSelectedRootValueRole::Predecessor,
            LocalLogStorageSelectedRootGenerationField::ActiveFrame,
            predecessor.frame == checkpoint_frame,
        )?;
        validate_generation(
            LocalLogStorageSelectedRootValueRole::Predecessor,
            LocalLogStorageSelectedRootGenerationField::ActivationFenceId,
            &predecessor.activation_fence_id == checkpoint_fence,
        )?;
        if current.successor_log_id() == &predecessor.checkpoint_log_id {
            return Err(LocalLogStorageSelectedRootError::KnownGenerationIdReused);
        }

        let checkpoint_anchor = self.decode_checkpoint_anchor(
            current_receipt.session_id(),
            checkpoint.log_id(),
            active.log_id(),
            current.checkpoint_json(),
        )?;
        let previous_head_id = current_receipt
            .expected_head_id()
            .cloned()
            .ok_or(LocalLogStorageSelectedRootError::RuntimeInvariant)?;

        Ok(LocalLogStorageSelectedRoot::from_parts(LocalLogStorageSelectedRootParts {
            profile_id: current_receipt.profile_id().clone(),
            profile_version: current_receipt.profile_version(),
            database_incarnation_id: current_receipt.database_incarnation_id().clone(),
            scope_id: current_receipt.scope_id().clone(),
            scope_incarnation_id: current_receipt.scope_incarnation_id().clone(),
            selected_head_id: current_receipt.committed_head_id().clone(),
            previous_head_id: Some(previous_head_id),
            selection_kind: LocalLogStorageSelectionKind::Rotation,
            transaction_id: current_receipt.transaction_id().clone(),
            activation_fence_id: active.activated_fence_id().clone(),
            session_id: current_receipt.session_id().clone(),
            checkpoint_log_id: checkpoint.log_id().clone(),
            active_log_id: active.log_id().clone(),
            active_frame: active.frame(),
            checkpoint_json: current.checkpoint_json().to_owned(),
            checkpoint_anchor,
        }))
    }

    fn decode_predecessor_active(
        &self,
        receipt: &LocalLogStorageSelectionReceiptBinding,
        json: &str,
    ) -> Result<DecodedPredecessorActive, LocalLogStorageSelectedRootError> {
        let role = LocalLogStorageSelectedRootValueRole::Predecessor;
        match receipt.selection_kind() {
            LocalLogStorageSelectionKind::Root => {
                let value = self.root_codec_for(receipt).decode_root(json).map_err(|error| {
                    LocalLogStorageSelectedRootError::InvalidSelection {
                        role,
                        selection_kind: LocalLogStorageSelectionKind::Root,
                        code: error.code(),
                    }
                })?;
                validate_receipt_assertions(
                    role,
                    receipt,
                    value.transaction_id(),
                    value.session_id(),
                )?;
                Ok(DecodedPredecessorActive {
                    checkpoint_log_id: value.checkpoint_log_id().clone(),
                    log_id: value.active_log_id().clone(),
                    frame: value.active_frame(),
                    activation_fence_id: value.fence_id().clone(),
                })
            }
            LocalLogStorageSelectionKind::Rotation => {
                let value = self
                    .generation_codec_for(receipt)?
                    .decode_bound_rotation(json)
                    .map_err(|error| LocalLogStorageSelectedRootError::InvalidSelection {
                        role,
                        selection_kind: LocalLogStorageSelectionKind::Rotation,
                        code: error.code(),
                    })?;
                validate_receipt_assertions(
                    role,
                    receipt,
                    value.transaction_id(),
                    value.session_id(),
                )?;
                Ok(DecodedPredecessorActive {
                    checkpoint_log_id: value.sealed_log_id().clone(),
                    log_id: value.successor_log_id().clone(),
                    frame: value.successor_frame(),
                    activation_fence_id: value.fence_id().clone(),
                })
            }
        }
    }
}

const fn validate_generation(
    role: LocalLogStorageSelectedRootValueRole,
    field: LocalLogStorageSelectedRootGenerationField,
    matches: bool,
) -> Result<(), LocalLogStorageSelectedRootError> {
    if matches {
        Ok(())
    } else {
        Err(LocalLogStorageSelectedRootError::GenerationMismatch { role, field })
    }
}

use crate::local_log::{LocalLogId, LocalLogStorageFenceId};

use super::{
    LocalLogStorageGenerationFrameV2, LocalLogStorageSelectedJsonCodecV2,
    LocalLogStorageSelectedRootError, LocalLogStorageSelectedRootGenerationField,
    LocalLogStorageSelectedRootV2, LocalLogStorageSelectedRootValueRole,
    LocalLogStorageSelectionKind, LocalLogStorageSelectionReceiptBinding,
    local_log_storage_selected_json::validate_receipt_assertions,
    local_log_storage_selected_root::{
        LocalLogStoragePredecessorRotationSealedGeneration, LocalLogStorageSelectedRoot,
        LocalLogStorageSelectedRootParts,
    },
};

struct DecodedPredecessorActiveV2 {
    checkpoint_log_id: LocalLogId,
    log_id: LocalLogId,
    frame: LocalLogStorageGenerationFrameV2,
    activation_fence_id: LocalLogStorageFenceId,
    rotation_sealed_generation: Option<LocalLogStoragePredecessorRotationSealedGeneration>,
}

impl LocalLogStorageSelectedJsonCodecV2 {
    /// Strictly normalizes a selected Storage Generation V2 and its V2 predecessor.
    ///
    /// Both receipts must retain the receiving context's durable schema binding;
    /// both exact values must use Frame V2 and embed Checkpoint V2. Failure
    /// returns without replacing any caller-owned selected evidence.
    ///
    /// # Errors
    ///
    /// Returns [`LocalLogStorageSelectedRootError`] for routing, schema/frame,
    /// receipt, generation, checkpoint, or strict V2 decode failure.
    #[allow(clippy::too_many_lines)]
    pub fn normalize_rotation_v2(
        &self,
        current_json: &str,
        predecessor_json: &str,
    ) -> Result<LocalLogStorageSelectedRootV2, LocalLogStorageSelectedRootError> {
        self.require_current_kind(LocalLogStorageSelectionKind::Rotation)?;
        let current_receipt = self.binding().current_receipt();
        let current = self
            .generation_codec_for_v2(current_receipt)?
            .decode_bound_rotation(current_json)
            .map_err(|error| LocalLogStorageSelectedRootError::InvalidSelection {
                role: LocalLogStorageSelectedRootValueRole::Current,
                selection_kind: LocalLogStorageSelectionKind::Rotation,
                code: error.code(),
            })?;
        if current.schema_binding() != current_receipt.schema_binding() {
            return Err(LocalLogStorageSelectedRootError::SchemaBindingMismatch);
        }
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
        let predecessor =
            self.decode_predecessor_active_v2(predecessor_receipt, predecessor_json)?;
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
            predecessor.log_id == *checkpoint.log_id(),
        )?;
        validate_generation(
            LocalLogStorageSelectedRootValueRole::Predecessor,
            LocalLogStorageSelectedRootGenerationField::ActiveFrame,
            predecessor.frame == checkpoint_frame,
        )?;
        validate_generation(
            LocalLogStorageSelectedRootValueRole::Predecessor,
            LocalLogStorageSelectedRootGenerationField::ActivationFenceId,
            predecessor.activation_fence_id == *checkpoint_fence,
        )?;
        if current.successor_log_id() == &predecessor.checkpoint_log_id {
            return Err(LocalLogStorageSelectedRootError::KnownGenerationIdReused);
        }

        let checkpoint_anchor = self.decode_checkpoint_anchor_v2(
            current_receipt.session_id(),
            checkpoint.log_id(),
            active.log_id(),
            current.checkpoint_json(),
        )?;
        LocalLogStorageSelectedRoot::try_from_parts(LocalLogStorageSelectedRootParts {
            binding: self.binding().inner().clone(),
            checkpoint_json: current.checkpoint_json().to_owned(),
            current_selection_json: current_json.to_owned(),
            predecessor_selection_json: Some(predecessor_json.to_owned()),
            predecessor_checkpoint_log_id: Some(predecessor.checkpoint_log_id),
            predecessor_rotation_sealed_generation: predecessor.rotation_sealed_generation,
            checkpoint_anchor,
        })
        .map(LocalLogStorageSelectedRootV2::new)
    }

    fn decode_predecessor_active_v2(
        &self,
        receipt: &LocalLogStorageSelectionReceiptBinding,
        json: &str,
    ) -> Result<DecodedPredecessorActiveV2, LocalLogStorageSelectedRootError> {
        let role = LocalLogStorageSelectedRootValueRole::Predecessor;
        match receipt.selection_kind() {
            LocalLogStorageSelectionKind::Root => {
                let value = self.root_codec_for_v2(receipt).decode_root(json).map_err(|error| {
                    LocalLogStorageSelectedRootError::InvalidSelection {
                        role,
                        selection_kind: LocalLogStorageSelectionKind::Root,
                        code: error.code(),
                    }
                })?;
                if value.schema_binding() != receipt.schema_binding() {
                    return Err(LocalLogStorageSelectedRootError::SchemaBindingMismatch);
                }
                validate_receipt_assertions(
                    role,
                    receipt,
                    value.transaction_id(),
                    value.session_id(),
                )?;
                Ok(DecodedPredecessorActiveV2 {
                    checkpoint_log_id: value.checkpoint_log_id().clone(),
                    log_id: value.active_log_id().clone(),
                    frame: value.active_frame(),
                    activation_fence_id: value.fence_id().clone(),
                    rotation_sealed_generation: None,
                })
            }
            LocalLogStorageSelectionKind::Rotation => {
                let value = self
                    .generation_codec_for_v2(receipt)?
                    .decode_bound_rotation(json)
                    .map_err(|error| LocalLogStorageSelectedRootError::InvalidSelection {
                        role,
                        selection_kind: LocalLogStorageSelectionKind::Rotation,
                        code: error.code(),
                    })?;
                if value.schema_binding() != receipt.schema_binding() {
                    return Err(LocalLogStorageSelectedRootError::SchemaBindingMismatch);
                }
                validate_receipt_assertions(
                    role,
                    receipt,
                    value.transaction_id(),
                    value.session_id(),
                )?;
                let sealed_frame = value.sealed_frame();
                Ok(DecodedPredecessorActiveV2 {
                    checkpoint_log_id: value.sealed_log_id().clone(),
                    log_id: value.successor_log_id().clone(),
                    frame: value.successor_frame(),
                    activation_fence_id: value.fence_id().clone(),
                    rotation_sealed_generation: Some(
                        LocalLogStoragePredecessorRotationSealedGeneration::new_v2(
                            value.sealed_log_id().clone(),
                            sealed_frame,
                        ),
                    ),
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
    if matches { Ok(()) } else { Err(generation_mismatch(role, field)) }
}

const fn generation_mismatch(
    role: LocalLogStorageSelectedRootValueRole,
    field: LocalLogStorageSelectedRootGenerationField,
) -> LocalLogStorageSelectedRootError {
    LocalLogStorageSelectedRootError::GenerationMismatch { role, field }
}

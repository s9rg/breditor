use super::{
    LocalLogStorageSelectedJsonCodecV2, LocalLogStorageSelectedRootError,
    LocalLogStorageSelectedRootGenerationField, LocalLogStorageSelectedRootV2,
    LocalLogStorageSelectedRootValueRole, LocalLogStorageSelectionKind,
    local_log_storage_selected_json::validate_receipt_assertions,
    local_log_storage_selected_root::{
        LocalLogStorageSelectedRoot, LocalLogStorageSelectedRootParts,
    },
};

impl LocalLogStorageSelectedJsonCodecV2 {
    /// Strictly normalizes one canonical selected Storage Root V2 value.
    ///
    /// The supplied trusted binding must retain the same durable schema and a
    /// Frame V2 active generation. Failure never replaces or mutates the
    /// caller's selected evidence.
    ///
    /// # Errors
    ///
    /// Returns [`LocalLogStorageSelectedRootError`] for routing, schema/frame,
    /// receipt, generation, nested-checkpoint, or strict V2 decode failure.
    pub fn normalize_root_v2(
        &self,
        json: &str,
    ) -> Result<LocalLogStorageSelectedRootV2, LocalLogStorageSelectedRootError> {
        self.require_current_kind(LocalLogStorageSelectionKind::Root)?;
        let receipt = self.binding().current_receipt();
        let selection = self.root_codec_for_v2(receipt).decode_root(json).map_err(|error| {
            LocalLogStorageSelectedRootError::InvalidSelection {
                role: LocalLogStorageSelectedRootValueRole::Current,
                selection_kind: LocalLogStorageSelectionKind::Root,
                code: error.code(),
            }
        })?;
        if selection.schema_binding() != receipt.schema_binding() {
            return Err(LocalLogStorageSelectedRootError::SchemaBindingMismatch);
        }
        validate_receipt_assertions(
            LocalLogStorageSelectedRootValueRole::Current,
            receipt,
            selection.transaction_id(),
            selection.session_id(),
        )?;
        let checkpoint = self.binding().checkpoint_generation();
        let active = self.binding().active_generation();
        validate_generation(
            LocalLogStorageSelectedRootGenerationField::CheckpointLogId,
            selection.checkpoint_log_id() == checkpoint.log_id(),
        )?;
        validate_generation(
            LocalLogStorageSelectedRootGenerationField::ActiveLogId,
            selection.active_log_id() == active.log_id(),
        )?;
        validate_generation(
            LocalLogStorageSelectedRootGenerationField::ActiveFrame,
            selection.active_frame() == active.frame(),
        )?;
        validate_generation(
            LocalLogStorageSelectedRootGenerationField::ActivationFenceId,
            selection.fence_id() == active.activated_fence_id(),
        )?;

        let checkpoint_anchor = self.decode_checkpoint_anchor_v2(
            receipt.session_id(),
            checkpoint.log_id(),
            active.log_id(),
            selection.checkpoint_json(),
        )?;
        LocalLogStorageSelectedRoot::try_from_parts(LocalLogStorageSelectedRootParts {
            binding: self.binding().inner().clone(),
            checkpoint_json: selection.checkpoint_json().to_owned(),
            current_selection_json: json.to_owned(),
            predecessor_selection_json: None,
            predecessor_checkpoint_log_id: None,
            predecessor_rotation_sealed_generation: None,
            checkpoint_anchor,
        })
        .map(LocalLogStorageSelectedRootV2::new)
    }
}

const fn validate_generation(
    field: LocalLogStorageSelectedRootGenerationField,
    matches: bool,
) -> Result<(), LocalLogStorageSelectedRootError> {
    if matches { Ok(()) } else { Err(generation_mismatch(field)) }
}

const fn generation_mismatch(
    field: LocalLogStorageSelectedRootGenerationField,
) -> LocalLogStorageSelectedRootError {
    LocalLogStorageSelectedRootError::GenerationMismatch {
        role: LocalLogStorageSelectedRootValueRole::Current,
        field,
    }
}

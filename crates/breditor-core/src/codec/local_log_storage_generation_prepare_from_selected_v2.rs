use super::{
    LocalLogStorageGenerationBindingField, LocalLogStorageGenerationContinuityError,
    LocalLogStorageGenerationJsonCodecV2, LocalLogStorageGenerationManifestV2,
    LocalLogStorageGenerationPreparationInputs, LocalLogStorageGenerationV2CodecError,
    LocalLogStorageSelectedRootV2, LocalLogTailCompactionOutcomeV2,
    local_log_storage_generation_json_v2::validate_binding_field,
    local_log_storage_generation_prepare_v2::build_manifest,
};

impl LocalLogStorageGenerationJsonCodecV2 {
    /// Builds one V2 rotation from a normalized selected V2 root.
    ///
    /// Failure is non-destructive and no candidate is promoted or published.
    ///
    /// # Errors
    ///
    /// Returns [`LocalLogStorageGenerationV2CodecError`] for selected-edge,
    /// schema/frame, outcome, identity-reuse, checkpoint, or resource failure.
    pub fn prepare_rotation_from_selected(
        &self,
        selected: &LocalLogStorageSelectedRootV2,
        outcome: &LocalLogTailCompactionOutcomeV2,
        inputs: &LocalLogStorageGenerationPreparationInputs,
    ) -> Result<LocalLogStorageGenerationManifestV2, LocalLogStorageGenerationV2CodecError> {
        self.validate_selected_binding(selected)?;
        if outcome.schema_binding() != selected.schema_binding()
            || outcome.anchor().schema_binding() != self.schema_binding()
            || outcome.anchor().session().state().context() != self.context()
        {
            return Err(LocalLogStorageGenerationV2CodecError::ContextConfigurationMismatch);
        }
        validate_known_reuse(self, selected, outcome, inputs)?;
        validate_outcome(selected, outcome)?;
        let manifest = build_manifest(self, outcome, inputs)?;
        self.validate_rotation_from_selected_root(manifest.inner(), selected)?;
        self.validate_nested_checkpoint(manifest.inner())?;
        self.validate_output_size(manifest.inner())?;
        Ok(manifest)
    }
}

fn validate_known_reuse(
    codec: &LocalLogStorageGenerationJsonCodecV2,
    selected: &LocalLogStorageSelectedRootV2,
    outcome: &LocalLogTailCompactionOutcomeV2,
    inputs: &LocalLogStorageGenerationPreparationInputs,
) -> Result<(), LocalLogStorageGenerationV2CodecError> {
    if inputs.transaction_id() == selected.transaction_id()
        || selected
            .predecessor_receipt()
            .is_some_and(|receipt| inputs.transaction_id() == receipt.transaction_id())
    {
        return Err(LocalLogStorageGenerationContinuityError::TransactionIdReused.into());
    }
    if selected.previous_head_id().is_some_and(|head| codec.binding().committed_head_id() == head)
        || selected
            .predecessor_receipt()
            .and_then(|receipt| receipt.expected_head_id())
            .is_some_and(|head| codec.binding().committed_head_id() == head)
    {
        return Err(LocalLogStorageGenerationContinuityError::KnownHeadIdReused.into());
    }
    if outcome.anchor().successor_log_id() == selected.checkpoint_log_id()
        || selected
            .inner()
            .predecessor_checkpoint_log_id()
            .is_some_and(|log| outcome.anchor().successor_log_id() == log)
    {
        return Err(LocalLogStorageGenerationContinuityError::KnownGenerationIdReused.into());
    }
    if inputs.fence_id() == selected.activation_fence_id()
        || selected
            .inner()
            .binding()
            .checkpoint_generation()
            .activated_fence_id()
            .is_some_and(|fence| inputs.fence_id() == fence)
    {
        return Err(LocalLogStorageGenerationContinuityError::KnownFenceIdReused.into());
    }
    Ok(())
}

fn validate_outcome(
    selected: &LocalLogStorageSelectedRootV2,
    outcome: &LocalLogTailCompactionOutcomeV2,
) -> Result<(), LocalLogStorageGenerationV2CodecError> {
    let anchor = outcome.anchor();
    validate_binding_field(
        LocalLogStorageGenerationBindingField::SessionId,
        anchor.session_id() == selected.session_id(),
    )?;
    validate_binding_field(
        LocalLogStorageGenerationBindingField::SealedLogId,
        anchor.checkpoint_log_id() == selected.active_log_id(),
    )?;
    validate_binding_field(
        LocalLogStorageGenerationBindingField::SealedFrame,
        outcome.frame_limits() == selected.active_frame().limits(),
    )
}

use crate::{
    local_log::{LocalLogCheckpointBinding, LocalLogCheckpointBindingError},
    schema_admission::PreparedSchemaAdmissionV3,
};

use super::{
    LocalLogCheckpointJsonCodecV3, LocalLogStorageGenerationFrameV1,
    LocalLogStorageGenerationFrameV3, LocalLogStorageRootJsonCodecV3,
    LocalLogStorageRootPreparationInputs, LocalLogStorageRootSelection,
    LocalLogStorageRootSelectionParts, LocalLogStorageRootSelectionV3,
    LocalLogStorageRootV3CodecError,
    local_log_storage_root_json_v3::{nested_checkpoint_error, runtime_invariant},
};

impl LocalLogStorageRootJsonCodecV3 {
    /// Builds an unpublished V3 root from one prepared schema-admission checkpoint.
    ///
    /// This is deliberately not a tail-compaction adapter. It revalidates the
    /// prepared target binding, target anchor, and exact canonical Checkpoint
    /// V3 bytes directly, then constructs only root inspection data. It does
    /// not claim tail provenance, provision generations, publish a head, or
    /// grant writer authority. Every input remains borrowed on failure.
    ///
    /// # Errors
    ///
    /// Returns [`LocalLogStorageRootV3CodecError`] for context/schema, exact
    /// checkpoint-byte, trusted root association, frame, resource, or
    /// serialization failure.
    ///
    /// The older prepared type cannot be relabeled as a V3 proof:
    ///
    /// ```compile_fail
    /// use breditor_core::{codec::{LocalLogStorageRootJsonCodecV3, LocalLogStorageRootPreparationInputs}, schema_admission::PreparedSchemaAdmission};
    /// fn cannot_upgrade(codec: &LocalLogStorageRootJsonCodecV3, prepared: &PreparedSchemaAdmission, inputs: &LocalLogStorageRootPreparationInputs) {
    ///     let _ = codec.prepare_root_from_schema_admission(prepared, inputs);
    /// }
    /// ```
    pub fn prepare_root_from_schema_admission(
        &self,
        admission: &PreparedSchemaAdmissionV3,
        inputs: &LocalLogStorageRootPreparationInputs,
    ) -> Result<LocalLogStorageRootSelectionV3, LocalLogStorageRootV3CodecError> {
        let anchor = admission.target_checkpoint();
        if admission.target_schema_binding() != &self.schema_binding()
            || anchor.schema_binding() != self.schema_binding()
            || anchor.session().state().context() != self.context()
        {
            return Err(LocalLogStorageRootV3CodecError::ContextConfigurationMismatch);
        }
        self.validate_checkpoint_byte_limit(admission.target_checkpoint_json().len())?;
        let checkpoint_binding = LocalLogCheckpointBinding::try_new(
            anchor.session_id().clone(),
            anchor.checkpoint_log_id().clone(),
            anchor.successor_log_id().clone(),
        )
        .map_err(checkpoint_binding_invariant)?;
        let checkpoint_codec =
            LocalLogCheckpointJsonCodecV3::new(self.context().clone(), checkpoint_binding)
                .with_limits(self.limits().checkpoint());
        let decoded = checkpoint_codec
            .decode(admission.target_checkpoint_json())
            .map_err(nested_checkpoint_error)?;
        if decoded.schema_binding() != self.schema_binding() {
            return Err(LocalLogStorageRootV3CodecError::ContextConfigurationMismatch);
        }
        let canonical = checkpoint_codec.encode(anchor).map_err(nested_checkpoint_error)?;
        if canonical != admission.target_checkpoint_json() {
            return Err(LocalLogStorageRootV3CodecError::NonCanonicalCheckpointJson);
        }

        let active_frame = LocalLogStorageGenerationFrameV3::new(inputs.active_frame_limits());
        let selection = LocalLogStorageRootSelection::from_parts_v3(
            self.schema_binding(),
            LocalLogStorageRootSelectionParts {
                profile_id: self.binding().profile_id().clone(),
                profile_version: self.binding().profile_version(),
                scope_id: self.binding().scope_id().clone(),
                transaction_id: inputs.transaction_id().clone(),
                committed_head_id: self.binding().committed_head_id().clone(),
                fence_id: inputs.fence_id().clone(),
                session_id: anchor.session_id().clone(),
                checkpoint_log_id: anchor.checkpoint_log_id().clone(),
                active_log_id: anchor.successor_log_id().clone(),
                active_frame: LocalLogStorageGenerationFrameV1::new(active_frame.limits()),
                checkpoint_json: canonical,
            },
            active_frame,
        );
        self.validate_selection(&selection)?;
        self.validate_nested_checkpoint(&selection)?;
        self.validate_output_size(&selection)?;
        Ok(LocalLogStorageRootSelectionV3::new(selection))
    }
}

fn checkpoint_binding_invariant(
    error: LocalLogCheckpointBindingError,
) -> LocalLogStorageRootV3CodecError {
    match error {
        LocalLogCheckpointBindingError::GenerationNotAdvanced => {
            runtime_invariant("schema admission exposed equal checkpoint and active generations")
        }
    }
}

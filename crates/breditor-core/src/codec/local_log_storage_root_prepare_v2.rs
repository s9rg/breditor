use crate::local_log::{LocalLogCheckpointBinding, LocalLogCheckpointBindingError};

use super::{
    LocalLogCheckpointJsonCodecV2, LocalLogStorageGenerationFrameV1,
    LocalLogStorageGenerationFrameV2, LocalLogStorageRootJsonCodecV2,
    LocalLogStorageRootPreparationInputs, LocalLogStorageRootSelection,
    LocalLogStorageRootSelectionParts, LocalLogStorageRootSelectionV2,
    LocalLogStorageRootV2CodecError, LocalLogTailCompactionOutcomeV2,
    local_log_storage_root_json_v2::{nested_checkpoint_error, runtime_invariant},
};

impl LocalLogStorageRootJsonCodecV2 {
    /// Builds one fingerprint-bound initial root from a borrowed Frame V2 compaction.
    ///
    /// The anchor and outcome must retain the codec's complete durable schema
    /// binding. The output embeds exact Checkpoint V2 and records Frame V2 for
    /// the new active generation. Failure leaves both inputs unchanged.
    ///
    /// # Errors
    ///
    /// Returns [`LocalLogStorageRootV2CodecError`] for schema/context,
    /// checkpoint, topology, association, resource, or serialization failure.
    pub fn prepare_root(
        &self,
        outcome: &LocalLogTailCompactionOutcomeV2,
        inputs: &LocalLogStorageRootPreparationInputs,
    ) -> Result<LocalLogStorageRootSelectionV2, LocalLogStorageRootV2CodecError> {
        if outcome.schema_binding() != &self.schema_binding()
            || outcome.anchor().schema_binding() != self.schema_binding()
            || outcome.anchor().session().state().context() != self.context()
        {
            return Err(LocalLogStorageRootV2CodecError::ContextConfigurationMismatch);
        }
        if u32::from(outcome.frame_format_version()) != 2 {
            return Err(runtime_invariant("root preparation received a non-V2 tail outcome"));
        }

        let anchor = outcome.anchor();
        let checkpoint_binding = LocalLogCheckpointBinding::try_new(
            anchor.session_id().clone(),
            anchor.checkpoint_log_id().clone(),
            anchor.successor_log_id().clone(),
        )
        .map_err(checkpoint_binding_invariant)?;
        let checkpoint_codec =
            LocalLogCheckpointJsonCodecV2::new(self.context().clone(), checkpoint_binding)
                .with_limits(self.limits().checkpoint());
        let checkpoint_json = checkpoint_codec.encode(anchor).map_err(nested_checkpoint_error)?;
        self.validate_checkpoint_byte_limit(checkpoint_json.len())?;

        let active_frame = LocalLogStorageGenerationFrameV2::new(inputs.active_frame_limits());
        let selection = LocalLogStorageRootSelection::from_parts_v2(
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
                checkpoint_json,
            },
            active_frame,
        );
        self.validate_selection(&selection)?;
        self.validate_nested_checkpoint(&selection)?;
        self.validate_output_size(&selection)?;
        Ok(LocalLogStorageRootSelectionV2::new(selection))
    }
}

fn checkpoint_binding_invariant(
    error: LocalLogCheckpointBindingError,
) -> LocalLogStorageRootV2CodecError {
    match error {
        LocalLogCheckpointBindingError::GenerationNotAdvanced => {
            runtime_invariant("compaction exposed equal checkpoint and active generations")
        }
    }
}

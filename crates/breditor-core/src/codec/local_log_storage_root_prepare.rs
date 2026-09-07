use crate::local_log::{LocalLogCheckpointBinding, LocalLogCheckpointBindingError};

use super::{
    LocalLogCheckpointJsonCodec, LocalLogStorageGenerationFrameV1, LocalLogStorageRootCodecError,
    LocalLogStorageRootJsonCodec, LocalLogStorageRootPreparationInputs,
    LocalLogStorageRootSelection, LocalLogStorageRootSelectionParts, LocalLogTailCompactionOutcome,
    local_log_storage_root_json::{map_checkpoint_error, runtime_invariant},
};

impl LocalLogStorageRootJsonCodec {
    /// Validates one borrowed compaction outcome and builds an initial root
    /// selection candidate.
    ///
    /// Session, checkpoint-generation, active-generation, and exact checkpoint
    /// bytes are derived from the outcome's anchor. The old tail's accepted
    /// prefix and frame policy are intentionally ignored; the active Frame V1
    /// policy comes only from `inputs`.
    ///
    /// This operation borrows all inputs. Success does not consume or abandon
    /// the checkpoint anchor, provision storage, reserve either generation,
    /// authorize a head update, or prove durability.
    ///
    /// # Errors
    ///
    /// Returns [`LocalLogStorageRootCodecError`] without changing the exact
    /// caller-owned outcome or preparation inputs.
    pub fn prepare_root(
        &self,
        outcome: &LocalLogTailCompactionOutcome,
        inputs: &LocalLogStorageRootPreparationInputs,
    ) -> Result<LocalLogStorageRootSelection, LocalLogStorageRootCodecError> {
        crate::schema::require_exact_breditor_base(self.context().schema())
            .map_err(|_| LocalLogStorageRootCodecError::ContextConfigurationMismatch)?;
        if outcome.anchor().session().state().context() != self.context() {
            return Err(LocalLogStorageRootCodecError::ContextConfigurationMismatch);
        }

        let anchor = outcome.anchor();
        let checkpoint_binding = LocalLogCheckpointBinding::try_new(
            anchor.session_id().clone(),
            anchor.checkpoint_log_id().clone(),
            anchor.successor_log_id().clone(),
        )
        .map_err(checkpoint_binding_invariant)?;
        let checkpoint_codec =
            LocalLogCheckpointJsonCodec::new(self.context().clone(), checkpoint_binding)
                .with_limits(self.limits().checkpoint());
        let checkpoint_json = checkpoint_codec.encode(anchor).map_err(map_checkpoint_error)?;
        self.validate_checkpoint_byte_limit(checkpoint_json.len())?;

        let selection =
            LocalLogStorageRootSelection::from_parts(LocalLogStorageRootSelectionParts {
                profile_id: self.binding().profile_id().clone(),
                profile_version: self.binding().profile_version(),
                scope_id: self.binding().scope_id().clone(),
                transaction_id: inputs.transaction_id().clone(),
                committed_head_id: self.binding().committed_head_id().clone(),
                fence_id: inputs.fence_id().clone(),
                session_id: anchor.session_id().clone(),
                checkpoint_log_id: anchor.checkpoint_log_id().clone(),
                active_log_id: anchor.successor_log_id().clone(),
                active_frame: LocalLogStorageGenerationFrameV1::new(inputs.active_frame_limits()),
                checkpoint_json,
            });

        self.validate_selection(&selection)?;
        self.validate_nested_checkpoint(&selection)?;
        self.validate_output_size(&selection)?;
        Ok(selection)
    }
}

fn checkpoint_binding_invariant(
    error: LocalLogCheckpointBindingError,
) -> LocalLogStorageRootCodecError {
    match error {
        LocalLogCheckpointBindingError::GenerationNotAdvanced => {
            runtime_invariant("compaction outcome exposed equal checkpoint and active generations")
        }
    }
}

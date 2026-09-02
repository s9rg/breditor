use crate::local_log::{LocalLogCheckpointBinding, LocalLogCheckpointBindingError};

use super::{
    LocalLogCheckpointJsonCodec, LocalLogStorageGenerationBindingField,
    LocalLogStorageGenerationCodecError, LocalLogStorageGenerationContinuityError,
    LocalLogStorageGenerationFrameV1, LocalLogStorageGenerationJsonCodec,
    LocalLogStorageGenerationManifest, LocalLogStorageGenerationManifestParts,
    LocalLogStorageGenerationPreparationInputs, LocalLogTailCompactionOutcome,
    local_log_storage_generation_json::{
        binding_mismatch, map_checkpoint_error, runtime_invariant,
    },
};

impl LocalLogStorageGenerationJsonCodec {
    /// Validates one borrowed compaction outcome and builds inspection data for
    /// an ordinary storage-generation rotation.
    ///
    /// This operation borrows the outcome and inputs. Success does not consume
    /// or quarantine the checkpoint anchor, reserve the successor, authorize a
    /// head update, or prove durability. The returned manifest is therefore
    /// not a prepared transaction typestate.
    ///
    /// # Errors
    ///
    /// Returns [`LocalLogStorageGenerationCodecError`] without changing the
    /// exact caller-owned outcome or preparation inputs.
    pub fn prepare_rotation(
        &self,
        prior: &LocalLogStorageGenerationManifest,
        outcome: &LocalLogTailCompactionOutcome,
        inputs: &LocalLogStorageGenerationPreparationInputs,
    ) -> Result<LocalLogStorageGenerationManifest, LocalLogStorageGenerationCodecError> {
        self.validate_prior_binding(prior)?;
        validate_known_identity_reuse(self, prior, inputs)?;
        if outcome.anchor().session().state().context() != self.context() {
            return Err(LocalLogStorageGenerationCodecError::ContextConfigurationMismatch);
        }
        validate_outcome_association(prior, outcome)?;

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

        let manifest =
            LocalLogStorageGenerationManifest::from_parts(LocalLogStorageGenerationManifestParts {
                profile_id: self.binding().profile_id().clone(),
                profile_version: self.binding().profile_version(),
                scope_id: self.binding().scope_id().clone(),
                transaction_id: inputs.transaction_id().clone(),
                expected_head_id: self.binding().expected_head_id().clone(),
                committed_head_id: self.binding().committed_head_id().clone(),
                fence_id: inputs.fence_id().clone(),
                session_id: anchor.session_id().clone(),
                sealed_log_id: anchor.checkpoint_log_id().clone(),
                successor_log_id: anchor.successor_log_id().clone(),
                accepted_prefix_bytes: outcome.accepted_prefix_bytes(),
                sealed_frame: LocalLogStorageGenerationFrameV1::new(outcome.frame_limits()),
                successor_frame: LocalLogStorageGenerationFrameV1::new(
                    inputs.successor_frame_limits(),
                ),
                checkpoint_json,
            });

        self.validate_rotation(&manifest, prior)?;
        self.validate_nested_checkpoint(&manifest)?;
        self.validate_output_size(&manifest)?;
        Ok(manifest)
    }
}

fn validate_known_identity_reuse(
    codec: &LocalLogStorageGenerationJsonCodec,
    prior: &LocalLogStorageGenerationManifest,
    inputs: &LocalLogStorageGenerationPreparationInputs,
) -> Result<(), LocalLogStorageGenerationCodecError> {
    if inputs.transaction_id() == prior.transaction_id() {
        return Err(LocalLogStorageGenerationContinuityError::TransactionIdReused.into());
    }
    if codec.binding().committed_head_id() == prior.expected_head_id() {
        return Err(LocalLogStorageGenerationContinuityError::KnownHeadIdReused.into());
    }
    Ok(())
}

fn validate_outcome_association(
    prior: &LocalLogStorageGenerationManifest,
    outcome: &LocalLogTailCompactionOutcome,
) -> Result<(), LocalLogStorageGenerationCodecError> {
    let anchor = outcome.anchor();
    if anchor.session_id() != prior.session_id() {
        return Err(binding_mismatch(LocalLogStorageGenerationBindingField::SessionId));
    }
    if anchor.checkpoint_log_id() != prior.successor_log_id() {
        return Err(binding_mismatch(LocalLogStorageGenerationBindingField::SealedLogId));
    }
    if outcome.frame_limits() != prior.successor_frame().limits() {
        return Err(binding_mismatch(LocalLogStorageGenerationBindingField::SealedFrame));
    }
    if anchor.successor_log_id() == prior.sealed_log_id() {
        return Err(LocalLogStorageGenerationContinuityError::KnownGenerationIdReused.into());
    }
    Ok(())
}

fn checkpoint_binding_invariant(
    error: LocalLogCheckpointBindingError,
) -> LocalLogStorageGenerationCodecError {
    match error {
        LocalLogCheckpointBindingError::GenerationNotAdvanced => runtime_invariant(
            "compaction outcome exposed equal sealed and successor checkpoint generations",
        ),
    }
}

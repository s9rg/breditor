use crate::local_log::{LocalLogCheckpointBinding, LocalLogCheckpointBindingError};

use super::{
    LocalLogCheckpointJsonCodecV3, LocalLogStorageGenerationBindingField,
    LocalLogStorageGenerationContinuityError, LocalLogStorageGenerationFrameV1,
    LocalLogStorageGenerationFrameV3, LocalLogStorageGenerationJsonCodecV3,
    LocalLogStorageGenerationManifest, LocalLogStorageGenerationManifestParts,
    LocalLogStorageGenerationManifestV3, LocalLogStorageGenerationPreparationInputs,
    LocalLogStorageGenerationV3CodecError, LocalLogTailCompactionOutcomeV3,
    local_log_storage_generation_json_v3::{
        nested_checkpoint_error, runtime_invariant, validate_binding_field,
    },
};

impl LocalLogStorageGenerationJsonCodecV3 {
    /// Builds one V3 rotation from a validated prior and Frame V3 compaction.
    ///
    /// Failure leaves the prior manifest, compaction outcome, and preparation
    /// inputs unchanged. No storage reservation or publication is performed.
    ///
    /// # Errors
    ///
    /// Returns [`LocalLogStorageGenerationV3CodecError`] for binding,
    /// continuity, schema/frame, checkpoint, resource, or encoding failure.
    pub fn prepare_rotation(
        &self,
        prior: &LocalLogStorageGenerationManifestV3,
        outcome: &LocalLogTailCompactionOutcomeV3,
        inputs: &LocalLogStorageGenerationPreparationInputs,
    ) -> Result<LocalLogStorageGenerationManifestV3, LocalLogStorageGenerationV3CodecError> {
        validate_prior_binding(self, prior.inner())?;
        if inputs.transaction_id() == prior.transaction_id() {
            return Err(LocalLogStorageGenerationContinuityError::TransactionIdReused.into());
        }
        if self.binding().committed_head_id() == prior.expected_head_id() {
            return Err(LocalLogStorageGenerationContinuityError::KnownHeadIdReused.into());
        }
        validate_outcome(self, prior.inner(), outcome)?;
        let manifest = build_manifest(self, outcome, inputs)?;
        self.validate_rotation(manifest.inner(), prior.inner())?;
        self.validate_nested_checkpoint(manifest.inner())?;
        self.validate_output_size(manifest.inner())?;
        Ok(manifest)
    }
}

fn validate_prior_binding(
    codec: &LocalLogStorageGenerationJsonCodecV3,
    prior: &LocalLogStorageGenerationManifest,
) -> Result<(), LocalLogStorageGenerationV3CodecError> {
    if prior.schema_binding() != &codec.schema_binding()
        || prior.sealed_frame_format_version() != 3
        || prior.successor_frame_format_version() != 3
    {
        return Err(LocalLogStorageGenerationV3CodecError::ContextConfigurationMismatch);
    }
    validate_binding_field(
        LocalLogStorageGenerationBindingField::ProfileId,
        codec.binding().profile_id() == prior.profile_id(),
    )?;
    validate_binding_field(
        LocalLogStorageGenerationBindingField::ProfileVersion,
        codec.binding().profile_version() == prior.profile_version(),
    )?;
    validate_binding_field(
        LocalLogStorageGenerationBindingField::ScopeId,
        codec.binding().scope_id() == prior.scope_id(),
    )?;
    validate_binding_field(
        LocalLogStorageGenerationBindingField::ExpectedHeadId,
        codec.binding().expected_head_id() == prior.committed_head_id(),
    )
}

fn validate_outcome(
    codec: &LocalLogStorageGenerationJsonCodecV3,
    prior: &LocalLogStorageGenerationManifest,
    outcome: &LocalLogTailCompactionOutcomeV3,
) -> Result<(), LocalLogStorageGenerationV3CodecError> {
    if outcome.schema_binding() != &codec.schema_binding()
        || outcome.anchor().schema_binding() != codec.schema_binding()
        || outcome.anchor().session().state().context() != codec.context()
    {
        return Err(LocalLogStorageGenerationV3CodecError::ContextConfigurationMismatch);
    }
    let anchor = outcome.anchor();
    validate_binding_field(
        LocalLogStorageGenerationBindingField::SessionId,
        anchor.session_id() == prior.session_id(),
    )?;
    validate_binding_field(
        LocalLogStorageGenerationBindingField::SealedLogId,
        anchor.checkpoint_log_id() == prior.successor_log_id(),
    )?;
    validate_binding_field(
        LocalLogStorageGenerationBindingField::SealedFrame,
        outcome.frame_limits() == prior.successor_frame().limits(),
    )?;
    if anchor.successor_log_id() == prior.sealed_log_id() {
        return Err(LocalLogStorageGenerationContinuityError::KnownGenerationIdReused.into());
    }
    Ok(())
}

pub(super) fn build_manifest(
    codec: &LocalLogStorageGenerationJsonCodecV3,
    outcome: &LocalLogTailCompactionOutcomeV3,
    inputs: &LocalLogStorageGenerationPreparationInputs,
) -> Result<LocalLogStorageGenerationManifestV3, LocalLogStorageGenerationV3CodecError> {
    let anchor = outcome.anchor();
    let checkpoint_binding = LocalLogCheckpointBinding::try_new(
        anchor.session_id().clone(),
        anchor.checkpoint_log_id().clone(),
        anchor.successor_log_id().clone(),
    )
    .map_err(checkpoint_binding_invariant)?;
    let checkpoint_codec =
        LocalLogCheckpointJsonCodecV3::new(codec.context().clone(), checkpoint_binding)
            .with_limits(codec.limits().checkpoint());
    let checkpoint_json = checkpoint_codec.encode(anchor).map_err(nested_checkpoint_error)?;
    codec.validate_checkpoint_byte_limit(checkpoint_json.len())?;
    let sealed_frame = LocalLogStorageGenerationFrameV3::new(outcome.frame_limits());
    let successor_frame = LocalLogStorageGenerationFrameV3::new(inputs.successor_frame_limits());
    Ok(LocalLogStorageGenerationManifestV3::new(LocalLogStorageGenerationManifest::from_parts_v3(
        codec.schema_binding(),
        LocalLogStorageGenerationManifestParts {
            profile_id: codec.binding().profile_id().clone(),
            profile_version: codec.binding().profile_version(),
            scope_id: codec.binding().scope_id().clone(),
            transaction_id: inputs.transaction_id().clone(),
            expected_head_id: codec.binding().expected_head_id().clone(),
            committed_head_id: codec.binding().committed_head_id().clone(),
            fence_id: inputs.fence_id().clone(),
            session_id: anchor.session_id().clone(),
            sealed_log_id: anchor.checkpoint_log_id().clone(),
            successor_log_id: anchor.successor_log_id().clone(),
            accepted_prefix_bytes: outcome.accepted_prefix_bytes(),
            sealed_frame: LocalLogStorageGenerationFrameV1::new(sealed_frame.limits()),
            successor_frame: LocalLogStorageGenerationFrameV1::new(successor_frame.limits()),
            checkpoint_json,
        },
        sealed_frame,
        successor_frame,
    )))
}

fn checkpoint_binding_invariant(
    error: LocalLogCheckpointBindingError,
) -> LocalLogStorageGenerationV3CodecError {
    match error {
        LocalLogCheckpointBindingError::GenerationNotAdvanced => {
            runtime_invariant("compaction exposed equal sealed and successor generations")
        }
    }
}

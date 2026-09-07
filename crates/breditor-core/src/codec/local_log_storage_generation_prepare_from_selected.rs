use crate::local_log::{LocalLogCheckpointBinding, LocalLogCheckpointBindingError};

use super::{
    LocalLogCheckpointJsonCodec, LocalLogStorageGenerationBindingField,
    LocalLogStorageGenerationCodecError, LocalLogStorageGenerationContinuityError,
    LocalLogStorageGenerationFrameV1, LocalLogStorageGenerationJsonCodec,
    LocalLogStorageGenerationManifest, LocalLogStorageGenerationManifestParts,
    LocalLogStorageGenerationPreparationInputs, LocalLogStorageSelectedRoot,
    LocalLogTailCompactionOutcome,
    local_log_storage_generation_json::{
        binding_mismatch, map_checkpoint_error, runtime_invariant,
    },
};

impl LocalLogStorageGenerationJsonCodec {
    /// Builds one inspected rotation from a normalized current selection and a
    /// borrowed active-tail compaction outcome.
    ///
    /// The action checks the codec's trusted profile/scope/head association,
    /// the outcome's session, sealed generation and frame, and all identities
    /// known from the selected O(1) summary. It then strictly encodes and
    /// replays the outcome checkpoint under the configured limits.
    ///
    /// Success does not consume either input, prove that the outcome causally
    /// descended from the selected value's private anchor, reserve or inspect
    /// storage, attest the current head, perform compare-and-swap, establish
    /// durability, release an old owner, or grant writer authority.
    ///
    /// # Errors
    ///
    /// Returns [`LocalLogStorageGenerationCodecError`] without changing the
    /// selected root, compaction outcome, or preparation inputs.
    pub fn prepare_rotation_from_selected(
        &self,
        selected: &LocalLogStorageSelectedRoot,
        outcome: &LocalLogTailCompactionOutcome,
        inputs: &LocalLogStorageGenerationPreparationInputs,
    ) -> Result<LocalLogStorageGenerationManifest, LocalLogStorageGenerationCodecError> {
        crate::schema::require_exact_breditor_base(self.context().schema())
            .map_err(|_| LocalLogStorageGenerationCodecError::ContextConfigurationMismatch)?;
        self.validate_selected_binding(selected)?;
        validate_known_identity_reuse(self, selected, outcome, inputs)?;

        if outcome.anchor().session().state().context() != self.context() {
            return Err(LocalLogStorageGenerationCodecError::ContextConfigurationMismatch);
        }
        validate_outcome_association(selected, outcome)?;

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

        self.validate_rotation_from_selected_root(&manifest, selected)?;
        self.validate_nested_checkpoint(&manifest)?;
        self.validate_output_size(&manifest)?;
        Ok(manifest)
    }
}

fn validate_known_identity_reuse(
    codec: &LocalLogStorageGenerationJsonCodec,
    selected: &LocalLogStorageSelectedRoot,
    outcome: &LocalLogTailCompactionOutcome,
    inputs: &LocalLogStorageGenerationPreparationInputs,
) -> Result<(), LocalLogStorageGenerationCodecError> {
    if inputs.transaction_id() == selected.transaction_id()
        || selected
            .predecessor_receipt()
            .is_some_and(|receipt| inputs.transaction_id() == receipt.transaction_id())
    {
        return Err(LocalLogStorageGenerationContinuityError::TransactionIdReused.into());
    }
    if selected
        .previous_head_id()
        .is_some_and(|head_id| codec.binding().committed_head_id() == head_id)
        || selected
            .predecessor_receipt()
            .and_then(|receipt| receipt.expected_head_id())
            .is_some_and(|head_id| codec.binding().committed_head_id() == head_id)
    {
        return Err(LocalLogStorageGenerationContinuityError::KnownHeadIdReused.into());
    }
    if outcome.anchor().successor_log_id() == selected.checkpoint_log_id()
        || selected
            .predecessor_checkpoint_log_id()
            .is_some_and(|log_id| outcome.anchor().successor_log_id() == log_id)
    {
        return Err(LocalLogStorageGenerationContinuityError::KnownGenerationIdReused.into());
    }
    if inputs.fence_id() == selected.activation_fence_id()
        || selected
            .binding()
            .checkpoint_generation()
            .activated_fence_id()
            .is_some_and(|fence_id| inputs.fence_id() == fence_id)
    {
        return Err(LocalLogStorageGenerationContinuityError::KnownFenceIdReused.into());
    }
    Ok(())
}

fn validate_outcome_association(
    selected: &LocalLogStorageSelectedRoot,
    outcome: &LocalLogTailCompactionOutcome,
) -> Result<(), LocalLogStorageGenerationCodecError> {
    let anchor = outcome.anchor();
    if anchor.session_id() != selected.session_id() {
        return Err(binding_mismatch(LocalLogStorageGenerationBindingField::SessionId));
    }
    if anchor.checkpoint_log_id() != selected.active_log_id() {
        return Err(binding_mismatch(LocalLogStorageGenerationBindingField::SealedLogId));
    }
    if outcome.frame_limits() != selected.active_frame().limits() {
        return Err(binding_mismatch(LocalLogStorageGenerationBindingField::SealedFrame));
    }
    Ok(())
}

fn checkpoint_binding_invariant(
    error: LocalLogCheckpointBindingError,
) -> LocalLogStorageGenerationCodecError {
    match error {
        LocalLogCheckpointBindingError::GenerationNotAdvanced => runtime_invariant(
            "selected rotation outcome exposed equal sealed and successor generations",
        ),
    }
}

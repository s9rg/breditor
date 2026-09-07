use crate::{
    local_log::{LocalLogCheckpointBinding, LocalLogCheckpointBindingError},
    schema::DurableSchemaBinding,
    state::EditorContext,
};

use super::{
    BoundedDiagnostic, LocalLogCheckpointJsonCodecV2, LocalLogCheckpointV2CodecError,
    LocalLogStorageGenerationLimits, LocalLogStorageRootBinding, LocalLogStorageRootBindingField,
    LocalLogStorageRootJsonFailure, LocalLogStorageRootResourceLimit, LocalLogStorageRootSelection,
    LocalLogStorageRootTopologyError, LocalLogStorageRootV2CodecError, json_size::JsonByteCounter,
    local_log_storage_root_encoding_v2::LocalLogStorageRootEncodingV2,
};

/// Storage Root wire version accepted and emitted by the V2 codec.
pub const LOCAL_LOG_STORAGE_ROOT_V2_FORMAT_VERSION: u32 = 2;

/// Strict fingerprint-bound codec for one initial local-log storage root.
#[derive(Clone, Debug)]
pub struct LocalLogStorageRootJsonCodecV2 {
    context: EditorContext,
    binding: LocalLogStorageRootBinding,
    limits: LocalLogStorageGenerationLimits,
}

impl LocalLogStorageRootJsonCodecV2 {
    /// Creates a trusted-association V2 codec with conservative limits.
    #[must_use]
    pub fn new(context: EditorContext, binding: LocalLogStorageRootBinding) -> Self {
        Self { context, binding, limits: LocalLogStorageGenerationLimits::default() }
    }

    /// Replaces the independent root and nested-checkpoint policies.
    #[must_use]
    pub const fn with_limits(mut self, limits: LocalLogStorageGenerationLimits) -> Self {
        self.limits = limits;
        self
    }

    /// Returns the trusted editor context used for schema admission and replay.
    #[must_use]
    pub const fn context(&self) -> &EditorContext {
        &self.context
    }

    /// Returns the independently supplied storage association.
    #[must_use]
    pub const fn binding(&self) -> &LocalLogStorageRootBinding {
        &self.binding
    }

    /// Returns the exact trusted durable schema binding.
    #[must_use]
    pub fn schema_binding(&self) -> DurableSchemaBinding {
        self.context.schema().durable_binding()
    }

    /// Returns the complete host-authoritative resource policy.
    #[must_use]
    pub const fn limits(&self) -> &LocalLogStorageGenerationLimits {
        &self.limits
    }

    pub(super) fn validate_selection(
        &self,
        value: &LocalLogStorageRootSelection,
    ) -> Result<(), LocalLogStorageRootV2CodecError> {
        if value.schema_binding() != &self.schema_binding() {
            return Err(LocalLogStorageRootV2CodecError::ContextConfigurationMismatch);
        }
        if value.active_frame_format_version() != 2 {
            return Err(runtime_invariant("Storage Root V2 requires a Frame V2 policy"));
        }
        if value.checkpoint_log_id() == value.active_log_id() {
            return Err(LocalLogStorageRootTopologyError::GenerationNotAdvanced.into());
        }
        validate_binding_field(
            LocalLogStorageRootBindingField::ProfileId,
            self.binding.profile_id() == value.profile_id(),
        )?;
        validate_binding_field(
            LocalLogStorageRootBindingField::ProfileVersion,
            self.binding.profile_version() == value.profile_version(),
        )?;
        validate_binding_field(
            LocalLogStorageRootBindingField::ScopeId,
            self.binding.scope_id() == value.scope_id(),
        )?;
        validate_binding_field(
            LocalLogStorageRootBindingField::CommittedHeadId,
            self.binding.committed_head_id() == value.committed_head_id(),
        )
    }

    pub(super) fn validate_nested_checkpoint(
        &self,
        value: &LocalLogStorageRootSelection,
    ) -> Result<(), LocalLogStorageRootV2CodecError> {
        self.validate_checkpoint_byte_limit(value.checkpoint_json_bytes())?;
        let binding = LocalLogCheckpointBinding::try_new(
            value.session_id().clone(),
            value.checkpoint_log_id().clone(),
            value.active_log_id().clone(),
        )
        .map_err(checkpoint_binding_invariant)?;
        let codec = LocalLogCheckpointJsonCodecV2::new(self.context.clone(), binding)
            .with_limits(self.limits.checkpoint());
        let anchor = codec.decode(value.checkpoint_json()).map_err(nested_checkpoint_error)?;
        if anchor.schema_binding() != *value.schema_binding() {
            return Err(LocalLogStorageRootV2CodecError::ContextConfigurationMismatch);
        }
        let canonical = codec.encode(&anchor).map_err(nested_checkpoint_error)?;
        if canonical != value.checkpoint_json() {
            return Err(LocalLogStorageRootV2CodecError::NonCanonicalCheckpointJson);
        }
        Ok(())
    }

    pub(super) fn validate_checkpoint_byte_limit(
        &self,
        actual: usize,
    ) -> Result<(), LocalLogStorageRootV2CodecError> {
        let maximum = self.limits.max_checkpoint_json_bytes();
        if actual > maximum {
            return Err(LocalLogStorageRootResourceLimit::CheckpointJsonBytes {
                minimum: actual,
                maximum,
            }
            .into());
        }
        Ok(())
    }

    pub(super) fn validate_output_size(
        &self,
        value: &LocalLogStorageRootSelection,
    ) -> Result<(), LocalLogStorageRootV2CodecError> {
        let maximum = self.limits.max_output_bytes();
        let mut counter = JsonByteCounter::new(maximum);
        let result =
            serde_json::to_writer(&mut counter, &LocalLogStorageRootEncodingV2::new(value));
        if counter.exceeded() {
            return Err(LocalLogStorageRootV2CodecError::OutputTooLarge {
                minimum: counter.bytes(),
                maximum,
            });
        }
        result
            .map_err(|error| LocalLogStorageRootJsonFailure::from_serde(&error))
            .map_err(LocalLogStorageRootV2CodecError::Encoding)
    }
}

pub(super) const fn binding_mismatch(
    field: LocalLogStorageRootBindingField,
) -> LocalLogStorageRootV2CodecError {
    LocalLogStorageRootV2CodecError::BindingMismatch { field }
}

pub(super) fn validate_binding_field(
    field: LocalLogStorageRootBindingField,
    matches: bool,
) -> Result<(), LocalLogStorageRootV2CodecError> {
    if matches { Ok(()) } else { Err(binding_mismatch(field)) }
}

pub(super) fn runtime_invariant(diagnostic: &'static str) -> LocalLogStorageRootV2CodecError {
    LocalLogStorageRootV2CodecError::RuntimeInvariant {
        diagnostic: BoundedDiagnostic::from(diagnostic),
    }
}

fn checkpoint_binding_invariant(
    error: LocalLogCheckpointBindingError,
) -> LocalLogStorageRootV2CodecError {
    match error {
        LocalLogCheckpointBindingError::GenerationNotAdvanced => {
            runtime_invariant("validated root produced an equal checkpoint generation")
        }
    }
}

pub(super) fn nested_checkpoint_error(
    source: LocalLogCheckpointV2CodecError,
) -> LocalLogStorageRootV2CodecError {
    match source {
        LocalLogCheckpointV2CodecError::ContextConfigurationMismatch => {
            LocalLogStorageRootV2CodecError::ContextConfigurationMismatch
        }
        source => LocalLogStorageRootV2CodecError::InvalidCheckpoint(Box::new(source)),
    }
}

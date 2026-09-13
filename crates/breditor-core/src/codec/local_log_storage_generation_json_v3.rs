use crate::{
    local_log::{LocalLogCheckpointBinding, LocalLogCheckpointBindingError},
    schema::DurableSchemaBinding,
    state::EditorContext,
};

use super::{
    BoundedDiagnostic, LocalLogCheckpointJsonCodecV3, LocalLogCheckpointV3CodecError,
    LocalLogStorageGenerationBinding, LocalLogStorageGenerationBindingField,
    LocalLogStorageGenerationCodecError, LocalLogStorageGenerationJsonFailure,
    LocalLogStorageGenerationLimits, LocalLogStorageGenerationManifest,
    LocalLogStorageGenerationResourceLimit, LocalLogStorageGenerationV3CodecError,
    LocalLogStorageSelectedRootV3,
    json_size::JsonByteCounter,
    local_log_storage_generation_encoding_v3::LocalLogStorageGenerationEncodingV3,
    local_log_storage_generation_json::{
        validate_continuity, validate_intrinsic_topology, validate_prior_topology,
        validate_selected_continuity,
    },
};

/// Storage Generation wire version accepted and emitted by the V3 codec.
pub const LOCAL_LOG_STORAGE_GENERATION_V3_FORMAT_VERSION: u32 = 3;

/// Strict fingerprint-bound codec for one ordinary storage rotation.
#[derive(Clone, Debug)]
pub struct LocalLogStorageGenerationJsonCodecV3 {
    context: EditorContext,
    binding: LocalLogStorageGenerationBinding,
    limits: LocalLogStorageGenerationLimits,
}

impl LocalLogStorageGenerationJsonCodecV3 {
    /// Creates a trusted-association V3 codec with conservative limits.
    #[must_use]
    pub fn new(context: EditorContext, binding: LocalLogStorageGenerationBinding) -> Self {
        Self { context, binding, limits: LocalLogStorageGenerationLimits::default() }
    }

    /// Replaces the independent manifest and nested-checkpoint policies.
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

    /// Returns the independently supplied rotation association.
    #[must_use]
    pub const fn binding(&self) -> &LocalLogStorageGenerationBinding {
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

    pub(super) fn validate_manifest(
        &self,
        value: &LocalLogStorageGenerationManifest,
    ) -> Result<(), LocalLogStorageGenerationV3CodecError> {
        if value.schema_binding() != &self.schema_binding() {
            return Err(LocalLogStorageGenerationV3CodecError::ContextConfigurationMismatch);
        }
        if value.sealed_frame_format_version() != 3 || value.successor_frame_format_version() != 3 {
            return Err(runtime_invariant(
                "Storage Generation V3 requires sealed and successor Frame V3 policies",
            ));
        }
        v1(validate_intrinsic_topology(value))?;
        validate_binding_field(
            LocalLogStorageGenerationBindingField::ProfileId,
            self.binding.profile_id() == value.profile_id(),
        )?;
        validate_binding_field(
            LocalLogStorageGenerationBindingField::ProfileVersion,
            self.binding.profile_version() == value.profile_version(),
        )?;
        validate_binding_field(
            LocalLogStorageGenerationBindingField::ScopeId,
            self.binding.scope_id() == value.scope_id(),
        )?;
        validate_binding_field(
            LocalLogStorageGenerationBindingField::ExpectedHeadId,
            self.binding.expected_head_id() == value.expected_head_id(),
        )?;
        validate_binding_field(
            LocalLogStorageGenerationBindingField::CommittedHeadId,
            self.binding.committed_head_id() == value.committed_head_id(),
        )
    }

    pub(super) fn validate_rotation(
        &self,
        value: &LocalLogStorageGenerationManifest,
        prior: &LocalLogStorageGenerationManifest,
    ) -> Result<(), LocalLogStorageGenerationV3CodecError> {
        self.validate_manifest(value)?;
        if prior.schema_binding() != value.schema_binding()
            || prior.sealed_frame_format_version() != 3
            || prior.successor_frame_format_version() != 3
        {
            return Err(LocalLogStorageGenerationV3CodecError::ContextConfigurationMismatch);
        }
        v1(validate_continuity(value, prior))?;
        if value.fence_id() == prior.fence_id() {
            return Err(super::LocalLogStorageGenerationContinuityError::KnownFenceIdReused.into());
        }
        v1(validate_prior_topology(value, prior))
    }

    pub(super) fn validate_selected_binding(
        &self,
        selected: &LocalLogStorageSelectedRootV3,
    ) -> Result<(), LocalLogStorageGenerationV3CodecError> {
        if selected.schema_binding() != &self.schema_binding() {
            return Err(LocalLogStorageGenerationV3CodecError::ContextConfigurationMismatch);
        }
        if self.binding.profile_id() != selected.profile_id() {
            return Err(super::LocalLogStorageGenerationContinuityError::ProfileIdChanged.into());
        }
        if self.binding.profile_version() != selected.profile_version() {
            return Err(
                super::LocalLogStorageGenerationContinuityError::ProfileVersionChanged.into()
            );
        }
        if self.binding.scope_id() != selected.scope_id() {
            return Err(super::LocalLogStorageGenerationContinuityError::ScopeIdChanged.into());
        }
        if self.binding.expected_head_id() != selected.selected_head_id() {
            return Err(
                super::LocalLogStorageGenerationContinuityError::ExpectedHeadMismatch.into()
            );
        }
        Ok(())
    }

    pub(super) fn validate_rotation_from_selected_root(
        &self,
        value: &LocalLogStorageGenerationManifest,
        selected: &LocalLogStorageSelectedRootV3,
    ) -> Result<(), LocalLogStorageGenerationV3CodecError> {
        self.validate_manifest(value)?;
        self.validate_selected_binding(selected)?;
        if value.schema_binding() != selected.schema_binding() {
            return Err(LocalLogStorageGenerationV3CodecError::ContextConfigurationMismatch);
        }
        v1(validate_selected_continuity(value, selected.inner()))
    }

    pub(super) fn validate_nested_checkpoint(
        &self,
        value: &LocalLogStorageGenerationManifest,
    ) -> Result<(), LocalLogStorageGenerationV3CodecError> {
        self.validate_checkpoint_byte_limit(value.checkpoint_json_bytes())?;
        let binding = LocalLogCheckpointBinding::try_new(
            value.session_id().clone(),
            value.sealed_log_id().clone(),
            value.successor_log_id().clone(),
        )
        .map_err(checkpoint_binding_invariant)?;
        let codec = LocalLogCheckpointJsonCodecV3::new(self.context.clone(), binding)
            .with_limits(self.limits.checkpoint());
        let anchor = codec.decode(value.checkpoint_json()).map_err(nested_checkpoint_error)?;
        if anchor.schema_binding() != *value.schema_binding() {
            return Err(LocalLogStorageGenerationV3CodecError::ContextConfigurationMismatch);
        }
        let canonical = codec.encode(&anchor).map_err(nested_checkpoint_error)?;
        if canonical != value.checkpoint_json() {
            return Err(LocalLogStorageGenerationV3CodecError::NonCanonicalCheckpointJson);
        }
        Ok(())
    }

    pub(super) fn validate_checkpoint_byte_limit(
        &self,
        actual: usize,
    ) -> Result<(), LocalLogStorageGenerationV3CodecError> {
        let maximum = self.limits.max_checkpoint_json_bytes();
        if actual > maximum {
            return Err(LocalLogStorageGenerationResourceLimit::CheckpointJsonBytes {
                minimum: actual,
                maximum,
            }
            .into());
        }
        Ok(())
    }

    pub(super) fn validate_output_size(
        &self,
        value: &LocalLogStorageGenerationManifest,
    ) -> Result<(), LocalLogStorageGenerationV3CodecError> {
        let maximum = self.limits.max_output_bytes();
        let mut counter = JsonByteCounter::new(maximum);
        let result =
            serde_json::to_writer(&mut counter, &LocalLogStorageGenerationEncodingV3::new(value));
        if counter.exceeded() {
            return Err(LocalLogStorageGenerationV3CodecError::OutputTooLarge {
                minimum: counter.bytes(),
                maximum,
            });
        }
        result
            .map_err(|error| LocalLogStorageGenerationJsonFailure::from_serde(&error))
            .map_err(LocalLogStorageGenerationV3CodecError::Encoding)
    }
}

pub(super) fn validate_binding_field(
    field: LocalLogStorageGenerationBindingField,
    matches: bool,
) -> Result<(), LocalLogStorageGenerationV3CodecError> {
    if matches {
        Ok(())
    } else {
        Err(LocalLogStorageGenerationV3CodecError::BindingMismatch { field })
    }
}

pub(super) fn runtime_invariant(diagnostic: &'static str) -> LocalLogStorageGenerationV3CodecError {
    LocalLogStorageGenerationV3CodecError::RuntimeInvariant {
        diagnostic: BoundedDiagnostic::from(diagnostic),
    }
}

fn checkpoint_binding_invariant(
    error: LocalLogCheckpointBindingError,
) -> LocalLogStorageGenerationV3CodecError {
    match error {
        LocalLogCheckpointBindingError::GenerationNotAdvanced => {
            runtime_invariant("validated rotation produced an equal checkpoint generation")
        }
    }
}

pub(super) fn nested_checkpoint_error(
    source: LocalLogCheckpointV3CodecError,
) -> LocalLogStorageGenerationV3CodecError {
    match source {
        LocalLogCheckpointV3CodecError::ContextConfigurationMismatch => {
            LocalLogStorageGenerationV3CodecError::ContextConfigurationMismatch
        }
        source => LocalLogStorageGenerationV3CodecError::InvalidCheckpoint(Box::new(source)),
    }
}

pub(super) fn v1<T>(
    result: Result<T, LocalLogStorageGenerationCodecError>,
) -> Result<T, LocalLogStorageGenerationV3CodecError> {
    result.map_err(map_v1_error)
}

fn map_v1_error(
    error: LocalLogStorageGenerationCodecError,
) -> LocalLogStorageGenerationV3CodecError {
    match error {
        LocalLogStorageGenerationCodecError::ContextConfigurationMismatch => {
            LocalLogStorageGenerationV3CodecError::ContextConfigurationMismatch
        }
        LocalLogStorageGenerationCodecError::InputTooLarge { actual, maximum } => {
            LocalLogStorageGenerationV3CodecError::InputTooLarge { actual, maximum }
        }
        LocalLogStorageGenerationCodecError::OutputTooLarge { minimum, maximum } => {
            LocalLogStorageGenerationV3CodecError::OutputTooLarge { minimum, maximum }
        }
        LocalLogStorageGenerationCodecError::InvalidJson(source) => {
            LocalLogStorageGenerationV3CodecError::InvalidJson(source)
        }
        LocalLogStorageGenerationCodecError::UnsupportedFormat { expected } => {
            LocalLogStorageGenerationV3CodecError::UnsupportedFormat { expected }
        }
        LocalLogStorageGenerationCodecError::UnsupportedFormatVersion { found, .. } => {
            LocalLogStorageGenerationV3CodecError::UnsupportedFormatVersion {
                found,
                supported: LOCAL_LOG_STORAGE_GENERATION_V3_FORMAT_VERSION,
            }
        }
        LocalLogStorageGenerationCodecError::BindingMismatch { field } => {
            LocalLogStorageGenerationV3CodecError::BindingMismatch { field }
        }
        LocalLogStorageGenerationCodecError::InvalidRecord(source) => source.into(),
        LocalLogStorageGenerationCodecError::InvalidTopology(source) => source.into(),
        LocalLogStorageGenerationCodecError::InvalidContinuity(source) => source.into(),
        LocalLogStorageGenerationCodecError::ResourceLimit(source) => source.into(),
        LocalLogStorageGenerationCodecError::InvalidCheckpoint(_) => {
            runtime_invariant("scalar rotation decoder unexpectedly attempted checkpoint decoding")
        }
        LocalLogStorageGenerationCodecError::NonCanonicalCheckpointJson
        | LocalLogStorageGenerationCodecError::NonCanonicalManifestJson => {
            runtime_invariant("scalar rotation decoder unexpectedly attempted canonical validation")
        }
        LocalLogStorageGenerationCodecError::RuntimeInvariant { diagnostic } => {
            LocalLogStorageGenerationV3CodecError::RuntimeInvariant { diagnostic }
        }
        LocalLogStorageGenerationCodecError::Encoding(_) => {
            runtime_invariant("scalar rotation decoder unexpectedly attempted encoding")
        }
    }
}

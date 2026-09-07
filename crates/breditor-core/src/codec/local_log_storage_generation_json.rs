use std::io;

use crate::{
    local_log::{LocalLogCheckpointBinding, LocalLogCheckpointBindingError},
    record::{
        DecimalU64Record, LOCAL_LOG_STORAGE_GENERATION_FORMAT as RECORD_FORMAT,
        LOCAL_LOG_STORAGE_GENERATION_FORMAT_VERSION as RECORD_FORMAT_VERSION,
        LocalLogStorageGenerationFrameRecordV1, LocalLogStorageGenerationRecordV1,
    },
    state::EditorContext,
};

use super::{
    BoundedDiagnostic, LocalLogCheckpointCodecError, LocalLogCheckpointJsonCodec,
    LocalLogStorageGenerationBinding, LocalLogStorageGenerationBindingField,
    LocalLogStorageGenerationCodecError, LocalLogStorageGenerationContinuityError,
    LocalLogStorageGenerationJsonFailure, LocalLogStorageGenerationLimits,
    LocalLogStorageGenerationManifest, LocalLogStorageGenerationResourceLimit,
    LocalLogStorageGenerationTopologyError, LocalLogStorageSelectedRoot,
    json_size::JsonByteCounter,
};

/// Stable identifier for Breditor's storage-generation rotation manifest.
pub const LOCAL_LOG_STORAGE_GENERATION_FORMAT: &str = RECORD_FORMAT;

/// Storage-generation manifest wire version implemented by this codec.
pub const LOCAL_LOG_STORAGE_GENERATION_FORMAT_VERSION: u32 = RECORD_FORMAT_VERSION;

const LOCAL_LOG_STORAGE_GENERATION_FRAME_FORMAT_VERSION: u32 = 1;

/// Strict codec for one trusted-binding storage-generation rotation.
///
/// This codec validates and canonicalizes inspection data only. It performs no
/// I/O, head comparison-and-swap, writer fencing, successor reservation, or
/// durability decision. The binding must come from trusted host configuration,
/// never from the JSON being decoded.
#[derive(Clone, Debug)]
pub struct LocalLogStorageGenerationJsonCodec {
    context: EditorContext,
    binding: LocalLogStorageGenerationBinding,
    limits: LocalLogStorageGenerationLimits,
}

impl LocalLogStorageGenerationJsonCodec {
    /// Creates a trusted-binding codec with conservative default limits.
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

    /// Returns the trusted editor context used for nested checkpoint replay.
    #[must_use]
    pub const fn context(&self) -> &EditorContext {
        &self.context
    }

    /// Returns the independently supplied rotation association.
    #[must_use]
    pub const fn binding(&self) -> &LocalLogStorageGenerationBinding {
        &self.binding
    }

    /// Returns the complete host-authoritative resource policy.
    #[must_use]
    pub const fn limits(&self) -> &LocalLogStorageGenerationLimits {
        &self.limits
    }

    pub(super) fn validate_rotation(
        &self,
        value: &LocalLogStorageGenerationManifest,
        prior: &LocalLogStorageGenerationManifest,
    ) -> Result<(), LocalLogStorageGenerationCodecError> {
        self.validate_schema_and_frame_generation(value)?;
        self.validate_schema_and_frame_generation(prior)?;
        validate_intrinsic_topology(value)?;
        self.validate_binding(value)?;
        validate_continuity(value, prior)?;
        validate_prior_topology(value, prior)
    }

    /// Validates the trusted codec association against one normalized current
    /// selection before an action inspects caller-owned rotation material.
    pub(super) fn validate_selected_binding(
        &self,
        selected: &LocalLogStorageSelectedRoot,
    ) -> Result<(), LocalLogStorageGenerationCodecError> {
        if selected.schema_binding() != &self.context.schema().durable_binding() {
            return Err(LocalLogStorageGenerationCodecError::ContextConfigurationMismatch);
        }
        if selected.active_frame_format_version() != 1 {
            return Err(runtime_invariant("legacy rotation source retained a non-V1 frame policy"));
        }
        if self.binding.profile_id() != selected.profile_id() {
            return Err(LocalLogStorageGenerationContinuityError::ProfileIdChanged.into());
        }
        if self.binding.profile_version() != selected.profile_version() {
            return Err(LocalLogStorageGenerationContinuityError::ProfileVersionChanged.into());
        }
        if self.binding.scope_id() != selected.scope_id() {
            return Err(LocalLogStorageGenerationContinuityError::ScopeIdChanged.into());
        }
        if self.binding.expected_head_id() != selected.selected_head_id() {
            return Err(LocalLogStorageGenerationContinuityError::ExpectedHeadMismatch.into());
        }
        Ok(())
    }

    /// Rechecks one candidate rotation against a normalized current selection.
    pub(super) fn validate_rotation_from_selected_root(
        &self,
        value: &LocalLogStorageGenerationManifest,
        selected: &LocalLogStorageSelectedRoot,
    ) -> Result<(), LocalLogStorageGenerationCodecError> {
        self.validate_schema_and_frame_generation(value)?;
        validate_intrinsic_topology(value)?;
        self.validate_binding(value)?;
        self.validate_selected_binding(selected)?;
        validate_selected_continuity(value, selected)
    }

    pub(super) fn validate_prior_binding(
        &self,
        prior: &LocalLogStorageGenerationManifest,
    ) -> Result<(), LocalLogStorageGenerationCodecError> {
        self.validate_schema_and_frame_generation(prior)?;
        validate_binding_field(
            LocalLogStorageGenerationBindingField::ProfileId,
            self.binding.profile_id() == prior.profile_id(),
        )?;
        validate_binding_field(
            LocalLogStorageGenerationBindingField::ProfileVersion,
            self.binding.profile_version() == prior.profile_version(),
        )?;
        validate_binding_field(
            LocalLogStorageGenerationBindingField::ScopeId,
            self.binding.scope_id() == prior.scope_id(),
        )?;
        validate_binding_field(
            LocalLogStorageGenerationBindingField::ExpectedHeadId,
            self.binding.expected_head_id() == prior.committed_head_id(),
        )
    }

    fn validate_schema_and_frame_generation(
        &self,
        value: &LocalLogStorageGenerationManifest,
    ) -> Result<(), LocalLogStorageGenerationCodecError> {
        if value.schema_binding() != &self.context.schema().durable_binding() {
            return Err(LocalLogStorageGenerationCodecError::ContextConfigurationMismatch);
        }
        if value.sealed_frame_format_version() != LOCAL_LOG_STORAGE_GENERATION_FRAME_FORMAT_VERSION
            || value.successor_frame_format_version()
                != LOCAL_LOG_STORAGE_GENERATION_FRAME_FORMAT_VERSION
        {
            return Err(runtime_invariant(
                "legacy storage generation retained a non-V1 frame policy",
            ));
        }
        Ok(())
    }

    pub(super) fn validate_nested_checkpoint(
        &self,
        value: &LocalLogStorageGenerationManifest,
    ) -> Result<(), LocalLogStorageGenerationCodecError> {
        self.validate_checkpoint_byte_limit(value.checkpoint_json_bytes())?;
        let binding = LocalLogCheckpointBinding::try_new(
            value.session_id().clone(),
            value.sealed_log_id().clone(),
            value.successor_log_id().clone(),
        )
        .map_err(checkpoint_binding_invariant)?;
        let checkpoint_codec = LocalLogCheckpointJsonCodec::new(self.context.clone(), binding)
            .with_limits(self.limits.checkpoint());
        let anchor =
            checkpoint_codec.decode(value.checkpoint_json()).map_err(map_checkpoint_error)?;
        let canonical = checkpoint_codec.encode(&anchor).map_err(map_checkpoint_error)?;
        if canonical != value.checkpoint_json() {
            return Err(LocalLogStorageGenerationCodecError::NonCanonicalCheckpointJson);
        }
        Ok(())
    }

    pub(super) fn validate_checkpoint_byte_limit(
        &self,
        actual: usize,
    ) -> Result<(), LocalLogStorageGenerationCodecError> {
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

    fn validate_binding(
        &self,
        value: &LocalLogStorageGenerationManifest,
    ) -> Result<(), LocalLogStorageGenerationCodecError> {
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

    pub(super) fn validate_output_size(
        &self,
        value: &LocalLogStorageGenerationManifest,
    ) -> Result<(), LocalLogStorageGenerationCodecError> {
        let maximum = self.limits.max_output_bytes();
        let mut byte_counter = JsonByteCounter::new(maximum);
        let result = serde_json::to_writer(&mut byte_counter, &manifest_record(value));
        if byte_counter.exceeded() {
            return Err(LocalLogStorageGenerationCodecError::OutputTooLarge {
                minimum: byte_counter.bytes(),
                maximum,
            });
        }
        result
            .map_err(|error| LocalLogStorageGenerationJsonFailure::from_serde(&error))
            .map_err(LocalLogStorageGenerationCodecError::Encoding)
    }

    pub(super) fn validate_canonical_outer(
        value: &LocalLogStorageGenerationManifest,
        input: &str,
    ) -> Result<(), LocalLogStorageGenerationCodecError> {
        let mut matcher = CanonicalJsonMatcher::new(input.as_bytes());
        let result = serde_json::to_writer(&mut matcher, &manifest_record(value));
        if matcher.mismatched() || !matcher.complete() {
            return Err(LocalLogStorageGenerationCodecError::NonCanonicalManifestJson);
        }
        result
            .map_err(|error| LocalLogStorageGenerationJsonFailure::from_serde(&error))
            .map_err(LocalLogStorageGenerationCodecError::Encoding)
    }
}

pub(super) fn manifest_record(
    value: &LocalLogStorageGenerationManifest,
) -> LocalLogStorageGenerationRecordV1<'_> {
    LocalLogStorageGenerationRecordV1 {
        format: LOCAL_LOG_STORAGE_GENERATION_FORMAT,
        format_version: LOCAL_LOG_STORAGE_GENERATION_FORMAT_VERSION,
        profile_id: value.profile_id().as_str(),
        profile_version: value.profile_version().get(),
        scope_id: value.scope_id().as_str(),
        transaction_id: value.transaction_id().as_str(),
        expected_head_id: value.expected_head_id().as_str(),
        committed_head_id: value.committed_head_id().as_str(),
        fence_id: value.fence_id().as_str(),
        session_id: value.session_id().as_str(),
        sealed_log_id: value.sealed_log_id().as_str(),
        successor_log_id: value.successor_log_id().as_str(),
        accepted_prefix_bytes: DecimalU64Record::new(value.accepted_prefix_bytes()),
        sealed_frame: frame_record(value.sealed_frame().limits()),
        successor_frame: frame_record(value.successor_frame().limits()),
        checkpoint_json: value.checkpoint_json(),
    }
}

fn frame_record(limits: super::LocalLogFrameLimits) -> LocalLogStorageGenerationFrameRecordV1 {
    LocalLogStorageGenerationFrameRecordV1 {
        format_version: LOCAL_LOG_STORAGE_GENERATION_FRAME_FORMAT_VERSION,
        max_payload_bytes: DecimalU64Record::new(limits.max_payload_bytes()),
    }
}

pub(super) fn validate_intrinsic_topology(
    value: &LocalLogStorageGenerationManifest,
) -> Result<(), LocalLogStorageGenerationCodecError> {
    if value.expected_head_id() == value.committed_head_id() {
        return Err(LocalLogStorageGenerationTopologyError::HeadNotAdvanced.into());
    }
    if value.sealed_log_id() == value.successor_log_id() {
        return Err(LocalLogStorageGenerationTopologyError::GenerationNotAdvanced.into());
    }
    Ok(())
}

pub(super) fn validate_selected_continuity(
    value: &LocalLogStorageGenerationManifest,
    selected: &LocalLogStorageSelectedRoot,
) -> Result<(), LocalLogStorageGenerationCodecError> {
    if value.session_id() != selected.session_id() {
        return Err(LocalLogStorageGenerationContinuityError::SessionIdChanged.into());
    }
    if value.sealed_log_id() != selected.active_log_id() {
        return Err(LocalLogStorageGenerationContinuityError::SealedLogMismatch.into());
    }
    if value.sealed_frame() != selected.active_frame() {
        return Err(LocalLogStorageGenerationContinuityError::SealedFrameMismatch.into());
    }
    if value.transaction_id() == selected.transaction_id()
        || selected
            .predecessor_receipt()
            .is_some_and(|receipt| value.transaction_id() == receipt.transaction_id())
    {
        return Err(LocalLogStorageGenerationContinuityError::TransactionIdReused.into());
    }
    if selected.previous_head_id().is_some_and(|head_id| value.committed_head_id() == head_id)
        || selected
            .predecessor_receipt()
            .and_then(|receipt| receipt.expected_head_id())
            .is_some_and(|head_id| value.committed_head_id() == head_id)
    {
        return Err(LocalLogStorageGenerationContinuityError::KnownHeadIdReused.into());
    }
    if value.successor_log_id() == selected.checkpoint_log_id()
        || selected
            .predecessor_checkpoint_log_id()
            .is_some_and(|log_id| value.successor_log_id() == log_id)
    {
        return Err(LocalLogStorageGenerationContinuityError::KnownGenerationIdReused.into());
    }
    if value.fence_id() == selected.activation_fence_id()
        || selected
            .binding()
            .checkpoint_generation()
            .activated_fence_id()
            .is_some_and(|fence_id| value.fence_id() == fence_id)
    {
        return Err(LocalLogStorageGenerationContinuityError::KnownFenceIdReused.into());
    }
    Ok(())
}

pub(super) fn validate_continuity(
    value: &LocalLogStorageGenerationManifest,
    prior: &LocalLogStorageGenerationManifest,
) -> Result<(), LocalLogStorageGenerationCodecError> {
    if value.profile_id() != prior.profile_id() {
        return Err(LocalLogStorageGenerationContinuityError::ProfileIdChanged.into());
    }
    if value.profile_version() != prior.profile_version() {
        return Err(LocalLogStorageGenerationContinuityError::ProfileVersionChanged.into());
    }
    if value.scope_id() != prior.scope_id() {
        return Err(LocalLogStorageGenerationContinuityError::ScopeIdChanged.into());
    }
    if value.session_id() != prior.session_id() {
        return Err(LocalLogStorageGenerationContinuityError::SessionIdChanged.into());
    }
    if value.expected_head_id() != prior.committed_head_id() {
        return Err(LocalLogStorageGenerationContinuityError::ExpectedHeadMismatch.into());
    }
    if value.sealed_log_id() != prior.successor_log_id() {
        return Err(LocalLogStorageGenerationContinuityError::SealedLogMismatch.into());
    }
    if value.sealed_frame() != prior.successor_frame() {
        return Err(LocalLogStorageGenerationContinuityError::SealedFrameMismatch.into());
    }
    Ok(())
}

pub(super) fn validate_prior_topology(
    value: &LocalLogStorageGenerationManifest,
    prior: &LocalLogStorageGenerationManifest,
) -> Result<(), LocalLogStorageGenerationCodecError> {
    if value.transaction_id() == prior.transaction_id() {
        return Err(LocalLogStorageGenerationContinuityError::TransactionIdReused.into());
    }
    if value.committed_head_id() == prior.expected_head_id() {
        return Err(LocalLogStorageGenerationContinuityError::KnownHeadIdReused.into());
    }
    if value.successor_log_id() == prior.sealed_log_id() {
        return Err(LocalLogStorageGenerationContinuityError::KnownGenerationIdReused.into());
    }
    Ok(())
}

pub(super) fn binding_mismatch(
    field: LocalLogStorageGenerationBindingField,
) -> LocalLogStorageGenerationCodecError {
    LocalLogStorageGenerationCodecError::BindingMismatch { field }
}

fn validate_binding_field(
    field: LocalLogStorageGenerationBindingField,
    matches: bool,
) -> Result<(), LocalLogStorageGenerationCodecError> {
    if matches { Ok(()) } else { Err(binding_mismatch(field)) }
}

pub(super) fn runtime_invariant(diagnostic: &'static str) -> LocalLogStorageGenerationCodecError {
    LocalLogStorageGenerationCodecError::RuntimeInvariant {
        diagnostic: BoundedDiagnostic::from(diagnostic),
    }
}

fn checkpoint_binding_invariant(
    error: LocalLogCheckpointBindingError,
) -> LocalLogStorageGenerationCodecError {
    match error {
        LocalLogCheckpointBindingError::GenerationNotAdvanced => runtime_invariant(
            "validated storage-generation topology produced an equal checkpoint generation",
        ),
    }
}

pub(super) fn map_checkpoint_error(
    source: LocalLogCheckpointCodecError,
) -> LocalLogStorageGenerationCodecError {
    match source {
        LocalLogCheckpointCodecError::ContextConfigurationMismatch => {
            LocalLogStorageGenerationCodecError::ContextConfigurationMismatch
        }
        source => LocalLogStorageGenerationCodecError::InvalidCheckpoint(source.code()),
    }
}

struct CanonicalJsonMatcher<'a> {
    expected: &'a [u8],
    offset: usize,
    mismatched: bool,
}

impl<'a> CanonicalJsonMatcher<'a> {
    const fn new(expected: &'a [u8]) -> Self {
        Self { expected, offset: 0, mismatched: false }
    }

    const fn mismatched(&self) -> bool {
        self.mismatched
    }

    const fn complete(&self) -> bool {
        !self.mismatched && self.offset == self.expected.len()
    }
}

impl io::Write for CanonicalJsonMatcher<'_> {
    fn write(&mut self, buffer: &[u8]) -> io::Result<usize> {
        let Some(end) = self.offset.checked_add(buffer.len()) else {
            self.mismatched = true;
            return Err(io::Error::other("canonical JSON comparison overflowed"));
        };
        if self.expected.get(self.offset..end) != Some(buffer) {
            self.mismatched = true;
            return Err(io::Error::other("canonical JSON bytes differ"));
        }
        self.offset = end;
        Ok(buffer.len())
    }

    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}

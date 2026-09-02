use std::io;

use crate::{
    local_log::{LocalLogCheckpointBinding, LocalLogCheckpointBindingError},
    record::{
        DecimalU64Record, LOCAL_LOG_STORAGE_ROOT_FORMAT as RECORD_FORMAT,
        LOCAL_LOG_STORAGE_ROOT_FORMAT_VERSION as RECORD_FORMAT_VERSION,
        LocalLogStorageGenerationFrameRecordV1, LocalLogStorageRootRecordV1,
    },
    state::EditorContext,
};

use super::{
    BoundedDiagnostic, LocalLogCheckpointCodecError, LocalLogCheckpointJsonCodec,
    LocalLogStorageGenerationLimits, LocalLogStorageRootBinding, LocalLogStorageRootBindingField,
    LocalLogStorageRootCodecError, LocalLogStorageRootJsonFailure,
    LocalLogStorageRootResourceLimit, LocalLogStorageRootSelection,
    LocalLogStorageRootTopologyError, json_size::JsonByteCounter,
};

/// Stable identifier for Breditor's initial storage-root selection.
pub const LOCAL_LOG_STORAGE_ROOT_FORMAT: &str = RECORD_FORMAT;

/// Storage-root wire version implemented by this codec.
pub const LOCAL_LOG_STORAGE_ROOT_FORMAT_VERSION: u32 = RECORD_FORMAT_VERSION;

const LOCAL_LOG_STORAGE_ROOT_FRAME_FORMAT_VERSION: u32 = 1;

/// Strict codec for one trusted-binding initial local-log storage root.
///
/// This codec validates and canonicalizes inspection data only. It performs no
/// I/O, provisioning, emptiness check, head publication, writer fencing, or
/// durability decision. Its binding must come from independently trusted host
/// configuration, never from the JSON being decoded.
#[derive(Clone, Debug)]
pub struct LocalLogStorageRootJsonCodec {
    context: EditorContext,
    binding: LocalLogStorageRootBinding,
    limits: LocalLogStorageGenerationLimits,
}

impl LocalLogStorageRootJsonCodec {
    /// Creates a trusted-binding root codec with conservative default limits.
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

    /// Returns the trusted editor context used for nested checkpoint replay.
    #[must_use]
    pub const fn context(&self) -> &EditorContext {
        &self.context
    }

    /// Returns the independently supplied root association.
    #[must_use]
    pub const fn binding(&self) -> &LocalLogStorageRootBinding {
        &self.binding
    }

    /// Returns the complete host-authoritative resource policy.
    #[must_use]
    pub const fn limits(&self) -> &LocalLogStorageGenerationLimits {
        &self.limits
    }

    pub(super) fn validate_selection(
        &self,
        value: &LocalLogStorageRootSelection,
    ) -> Result<(), LocalLogStorageRootCodecError> {
        validate_intrinsic_topology(value)?;
        self.validate_binding(value)
    }

    pub(super) fn validate_nested_checkpoint(
        &self,
        value: &LocalLogStorageRootSelection,
    ) -> Result<(), LocalLogStorageRootCodecError> {
        self.validate_checkpoint_byte_limit(value.checkpoint_json_bytes())?;
        let binding = LocalLogCheckpointBinding::try_new(
            value.session_id().clone(),
            value.checkpoint_log_id().clone(),
            value.active_log_id().clone(),
        )
        .map_err(checkpoint_binding_invariant)?;
        let checkpoint_codec = LocalLogCheckpointJsonCodec::new(self.context.clone(), binding)
            .with_limits(self.limits.checkpoint());
        let anchor =
            checkpoint_codec.decode(value.checkpoint_json()).map_err(map_checkpoint_error)?;
        let canonical = checkpoint_codec.encode(&anchor).map_err(map_checkpoint_error)?;
        if canonical != value.checkpoint_json() {
            return Err(LocalLogStorageRootCodecError::NonCanonicalCheckpointJson);
        }
        Ok(())
    }

    pub(super) fn validate_checkpoint_byte_limit(
        &self,
        actual: usize,
    ) -> Result<(), LocalLogStorageRootCodecError> {
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

    fn validate_binding(
        &self,
        value: &LocalLogStorageRootSelection,
    ) -> Result<(), LocalLogStorageRootCodecError> {
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

    pub(super) fn validate_output_size(
        &self,
        value: &LocalLogStorageRootSelection,
    ) -> Result<(), LocalLogStorageRootCodecError> {
        let maximum = self.limits.max_output_bytes();
        let mut byte_counter = JsonByteCounter::new(maximum);
        let result = serde_json::to_writer(&mut byte_counter, &root_record(value));
        if byte_counter.exceeded() {
            return Err(LocalLogStorageRootCodecError::OutputTooLarge {
                minimum: byte_counter.bytes(),
                maximum,
            });
        }
        result
            .map_err(|error| LocalLogStorageRootJsonFailure::from_serde(&error))
            .map_err(LocalLogStorageRootCodecError::Encoding)
    }

    pub(super) fn validate_canonical_outer(
        value: &LocalLogStorageRootSelection,
        input: &str,
    ) -> Result<(), LocalLogStorageRootCodecError> {
        let mut matcher = CanonicalJsonMatcher::new(input.as_bytes());
        let result = serde_json::to_writer(&mut matcher, &root_record(value));
        if matcher.mismatched() || !matcher.complete() {
            return Err(LocalLogStorageRootCodecError::NonCanonicalRootJson);
        }
        result
            .map_err(|error| LocalLogStorageRootJsonFailure::from_serde(&error))
            .map_err(LocalLogStorageRootCodecError::Encoding)
    }
}

pub(super) fn root_record(value: &LocalLogStorageRootSelection) -> LocalLogStorageRootRecordV1<'_> {
    LocalLogStorageRootRecordV1 {
        format: LOCAL_LOG_STORAGE_ROOT_FORMAT,
        format_version: LOCAL_LOG_STORAGE_ROOT_FORMAT_VERSION,
        profile_id: value.profile_id().as_str(),
        profile_version: value.profile_version().get(),
        scope_id: value.scope_id().as_str(),
        transaction_id: value.transaction_id().as_str(),
        committed_head_id: value.committed_head_id().as_str(),
        fence_id: value.fence_id().as_str(),
        session_id: value.session_id().as_str(),
        checkpoint_log_id: value.checkpoint_log_id().as_str(),
        active_log_id: value.active_log_id().as_str(),
        active_frame: LocalLogStorageGenerationFrameRecordV1 {
            format_version: LOCAL_LOG_STORAGE_ROOT_FRAME_FORMAT_VERSION,
            max_payload_bytes: DecimalU64Record::new(
                value.active_frame().limits().max_payload_bytes(),
            ),
        },
        checkpoint_json: value.checkpoint_json(),
    }
}

fn validate_intrinsic_topology(
    value: &LocalLogStorageRootSelection,
) -> Result<(), LocalLogStorageRootCodecError> {
    if value.checkpoint_log_id() == value.active_log_id() {
        return Err(LocalLogStorageRootTopologyError::GenerationNotAdvanced.into());
    }
    Ok(())
}

pub(super) fn binding_mismatch(
    field: LocalLogStorageRootBindingField,
) -> LocalLogStorageRootCodecError {
    LocalLogStorageRootCodecError::BindingMismatch { field }
}

fn validate_binding_field(
    field: LocalLogStorageRootBindingField,
    matches: bool,
) -> Result<(), LocalLogStorageRootCodecError> {
    if matches { Ok(()) } else { Err(binding_mismatch(field)) }
}

pub(super) fn runtime_invariant(diagnostic: &'static str) -> LocalLogStorageRootCodecError {
    LocalLogStorageRootCodecError::RuntimeInvariant {
        diagnostic: BoundedDiagnostic::from(diagnostic),
    }
}

fn checkpoint_binding_invariant(
    error: LocalLogCheckpointBindingError,
) -> LocalLogStorageRootCodecError {
    match error {
        LocalLogCheckpointBindingError::GenerationNotAdvanced => runtime_invariant(
            "validated storage-root topology produced an equal checkpoint generation",
        ),
    }
}

pub(super) fn map_checkpoint_error(
    source: LocalLogCheckpointCodecError,
) -> LocalLogStorageRootCodecError {
    match source {
        LocalLogCheckpointCodecError::ContextConfigurationMismatch => {
            LocalLogStorageRootCodecError::ContextConfigurationMismatch
        }
        source => LocalLogStorageRootCodecError::InvalidCheckpoint(source.code()),
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

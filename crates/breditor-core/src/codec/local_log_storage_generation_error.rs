use std::{error::Error, fmt};

use thiserror::Error;

use super::{BoundedDiagnostic, CodecErrorCode, JsonFailureKind};

/// Payload-free JSON failure metadata for the storage-generation boundary.
///
/// Parser and serializer messages are deliberately discarded because they can
/// quote an attacker-controlled value or object key. Line and column numbers
/// are diagnostic coordinates only and do not retain manifest bytes.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct LocalLogStorageGenerationJsonFailure {
    kind: JsonFailureKind,
    line: usize,
    column: usize,
}

impl LocalLogStorageGenerationJsonFailure {
    /// Returns the broad parser or serializer failure category.
    #[must_use]
    pub const fn kind(self) -> JsonFailureKind {
        self.kind
    }

    /// Returns the one-based line reported by the JSON implementation.
    #[must_use]
    pub const fn line(self) -> usize {
        self.line
    }

    /// Returns the one-based column reported by the JSON implementation.
    #[must_use]
    pub const fn column(self) -> usize {
        self.column
    }

    pub(crate) fn from_serde(error: &serde_json::Error) -> Self {
        let kind = match error.classify() {
            serde_json::error::Category::Io => JsonFailureKind::Io,
            serde_json::error::Category::Syntax => JsonFailureKind::Syntax,
            serde_json::error::Category::Data => JsonFailureKind::Data,
            serde_json::error::Category::Eof => JsonFailureKind::EndOfInput,
        };
        Self { kind, line: error.line(), column: error.column() }
    }
}

impl fmt::Display for LocalLogStorageGenerationJsonFailure {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(formatter, "{:?} failure at line {}, column {}", self.kind, self.line, self.column)
    }
}

/// Stable checked-field category for Storage Generation V1.
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[non_exhaustive]
pub enum LocalLogStorageGenerationRecordErrorCode {
    /// `profileId` is not a valid qualified storage-profile name.
    InvalidProfileId,
    /// `profileVersion` is zero or not a fixed-width unsigned integer.
    InvalidProfileVersion,
    /// `scopeId` is not a valid storage-scope identity.
    InvalidScopeId,
    /// `transactionId` is not a valid storage-transaction identity.
    InvalidTransactionId,
    /// `expectedHeadId` is not a valid storage-head identity.
    InvalidExpectedHeadId,
    /// `committedHeadId` is not a valid storage-head identity.
    InvalidCommittedHeadId,
    /// `fenceId` is not a valid non-secret fence correlation identity.
    InvalidFenceId,
    /// `sessionId` is not a valid local-session identity.
    InvalidSessionId,
    /// `sealedLogId` is not a valid local-log identity.
    InvalidSealedLogId,
    /// `successorLogId` is not a valid local-log identity.
    InvalidSuccessorLogId,
    /// `acceptedPrefixBytes` is not a canonical decimal-string `u64`.
    InvalidAcceptedPrefixBytes,
    /// `sealedFrame.formatVersion` is not Frame V1.
    InvalidSealedFrameFormatVersion,
    /// `sealedFrame.maxPayloadBytes` is not a canonical decimal-string `u64`.
    InvalidSealedFrameMaxPayloadBytes,
    /// `successorFrame.formatVersion` is not Frame V1.
    InvalidSuccessorFrameFormatVersion,
    /// `successorFrame.maxPayloadBytes` is not a canonical decimal-string `u64`.
    InvalidSuccessorFrameMaxPayloadBytes,
}

impl LocalLogStorageGenerationRecordErrorCode {
    /// Returns the stable code used across language boundaries.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::InvalidProfileId => "local_log_storage_generation_record.invalid_profile_id",
            Self::InvalidProfileVersion => {
                "local_log_storage_generation_record.invalid_profile_version"
            }
            Self::InvalidScopeId => "local_log_storage_generation_record.invalid_scope_id",
            Self::InvalidTransactionId => {
                "local_log_storage_generation_record.invalid_transaction_id"
            }
            Self::InvalidExpectedHeadId => {
                "local_log_storage_generation_record.invalid_expected_head_id"
            }
            Self::InvalidCommittedHeadId => {
                "local_log_storage_generation_record.invalid_committed_head_id"
            }
            Self::InvalidFenceId => "local_log_storage_generation_record.invalid_fence_id",
            Self::InvalidSessionId => "local_log_storage_generation_record.invalid_session_id",
            Self::InvalidSealedLogId => "local_log_storage_generation_record.invalid_sealed_log_id",
            Self::InvalidSuccessorLogId => {
                "local_log_storage_generation_record.invalid_successor_log_id"
            }
            Self::InvalidAcceptedPrefixBytes => {
                "local_log_storage_generation_record.invalid_accepted_prefix_bytes"
            }
            Self::InvalidSealedFrameFormatVersion => {
                "local_log_storage_generation_record.invalid_sealed_frame_format_version"
            }
            Self::InvalidSealedFrameMaxPayloadBytes => {
                "local_log_storage_generation_record.invalid_sealed_frame_max_payload_bytes"
            }
            Self::InvalidSuccessorFrameFormatVersion => {
                "local_log_storage_generation_record.invalid_successor_frame_format_version"
            }
            Self::InvalidSuccessorFrameMaxPayloadBytes => {
                "local_log_storage_generation_record.invalid_successor_frame_max_payload_bytes"
            }
        }
    }
}

/// Stable location within Storage Generation V1.
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[non_exhaustive]
pub enum LocalLogStorageGenerationRecordLocation {
    /// Top-level `profileId`.
    ProfileId,
    /// Top-level `profileVersion`.
    ProfileVersion,
    /// Top-level `scopeId`.
    ScopeId,
    /// Top-level `transactionId`.
    TransactionId,
    /// Top-level `expectedHeadId`.
    ExpectedHeadId,
    /// Top-level `committedHeadId`.
    CommittedHeadId,
    /// Top-level `fenceId`.
    FenceId,
    /// Top-level `sessionId`.
    SessionId,
    /// Top-level `sealedLogId`.
    SealedLogId,
    /// Top-level `successorLogId`.
    SuccessorLogId,
    /// Top-level `acceptedPrefixBytes`.
    AcceptedPrefixBytes,
    /// Nested `sealedFrame.formatVersion`.
    SealedFrameFormatVersion,
    /// Nested `sealedFrame.maxPayloadBytes`.
    SealedFrameMaxPayloadBytes,
    /// Nested `successorFrame.formatVersion`.
    SuccessorFrameFormatVersion,
    /// Nested `successorFrame.maxPayloadBytes`.
    SuccessorFrameMaxPayloadBytes,
}

/// Breditor-owned details for one invalid manifest field.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct LocalLogStorageGenerationRecordError {
    code: LocalLogStorageGenerationRecordErrorCode,
    location: LocalLogStorageGenerationRecordLocation,
    diagnostic: BoundedDiagnostic,
}

impl LocalLogStorageGenerationRecordError {
    /// Returns the stable reconstruction failure category.
    #[must_use]
    pub const fn code(&self) -> LocalLogStorageGenerationRecordErrorCode {
        self.code
    }

    /// Returns the stable rejected-field location.
    #[must_use]
    pub const fn location(&self) -> LocalLogStorageGenerationRecordLocation {
        self.location
    }

    /// Returns the bounded human-readable diagnostic preview.
    #[must_use]
    pub fn diagnostic(&self) -> &str {
        self.diagnostic.preview()
    }

    /// Returns the bounded diagnostic and truncation metadata.
    #[must_use]
    pub const fn diagnostic_value(&self) -> &BoundedDiagnostic {
        &self.diagnostic
    }

    pub(crate) fn new(
        code: LocalLogStorageGenerationRecordErrorCode,
        location: LocalLogStorageGenerationRecordLocation,
        diagnostic: impl Into<BoundedDiagnostic>,
    ) -> Self {
        Self { code, location, diagnostic: diagnostic.into() }
    }
}

impl fmt::Display for LocalLogStorageGenerationRecordError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            formatter,
            "invalid local-log-storage-generation record at {:?}: {}",
            self.location, self.diagnostic
        )
    }
}

impl Error for LocalLogStorageGenerationRecordError {}

/// Trusted or outcome-derived field that disagreed with a manifest assertion.
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[non_exhaustive]
pub enum LocalLogStorageGenerationBindingField {
    /// Storage profile identity.
    ProfileId,
    /// Storage profile contract version.
    ProfileVersion,
    /// Storage scope identity.
    ScopeId,
    /// Selected prior authoritative head.
    ExpectedHeadId,
    /// Proposed replacement authoritative head.
    CommittedHeadId,
    /// Compaction outcome's session identity.
    SessionId,
    /// Compaction outcome's sealed generation identity.
    SealedLogId,
    /// Compaction outcome's old Frame V1 policy.
    SealedFrame,
}

impl LocalLogStorageGenerationBindingField {
    /// Returns the corresponding V1 field spelling.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::ProfileId => "profileId",
            Self::ProfileVersion => "profileVersion",
            Self::ScopeId => "scopeId",
            Self::ExpectedHeadId => "expectedHeadId",
            Self::CommittedHeadId => "committedHeadId",
            Self::SessionId => "sessionId",
            Self::SealedLogId => "sealedLogId",
            Self::SealedFrame => "sealedFrame",
        }
    }
}

/// Stable category for an impossible single-record or rotation topology.
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[non_exhaustive]
pub enum LocalLogStorageGenerationTopologyErrorCode {
    /// Expected and committed heads are equal.
    HeadNotAdvanced,
    /// Sealed and successor generations are equal.
    GenerationNotAdvanced,
}

impl LocalLogStorageGenerationTopologyErrorCode {
    /// Returns the stable code used across language boundaries.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::HeadNotAdvanced => "local_log_storage_generation_topology.head_not_advanced",
            Self::GenerationNotAdvanced => {
                "local_log_storage_generation_topology.generation_not_advanced"
            }
        }
    }
}

/// Why individually valid fields cannot describe one rotation topology.
#[derive(Clone, Copy, Debug, Eq, Error, PartialEq)]
#[non_exhaustive]
pub enum LocalLogStorageGenerationTopologyError {
    /// One rotation reuses its selected prior head.
    #[error("storage-generation rotation must advance to a distinct committed head")]
    HeadNotAdvanced,
    /// One rotation reuses its sealed generation as its successor.
    #[error("storage-generation rotation must advance to a distinct successor generation")]
    GenerationNotAdvanced,
}

impl LocalLogStorageGenerationTopologyError {
    /// Returns the stable topology failure category.
    #[must_use]
    pub const fn code(self) -> LocalLogStorageGenerationTopologyErrorCode {
        match self {
            Self::HeadNotAdvanced => LocalLogStorageGenerationTopologyErrorCode::HeadNotAdvanced,
            Self::GenerationNotAdvanced => {
                LocalLogStorageGenerationTopologyErrorCode::GenerationNotAdvanced
            }
        }
    }
}

/// Stable category for a broken prior-manifest rotation link.
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[non_exhaustive]
pub enum LocalLogStorageGenerationContinuityErrorCode {
    /// Storage profile identity changed.
    ProfileIdChanged,
    /// Storage profile contract version changed.
    ProfileVersionChanged,
    /// Storage scope identity changed.
    ScopeIdChanged,
    /// Local-session identity changed.
    SessionIdChanged,
    /// The new expected head is not the prior committed head.
    ExpectedHeadMismatch,
    /// The new sealed generation is not the prior successor.
    SealedLogMismatch,
    /// The new sealed frame policy is not the prior successor policy.
    SealedFrameMismatch,
    /// The new transaction reuses the immediately prior transaction ID.
    TransactionIdReused,
    /// The new committed head reuses the prior expected head.
    KnownHeadIdReused,
    /// The new successor reuses the prior sealed generation.
    KnownGenerationIdReused,
    /// The new activation fence reuses the selected value's fence identity.
    KnownFenceIdReused,
}

impl LocalLogStorageGenerationContinuityErrorCode {
    /// Returns the stable code used across language boundaries.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::ProfileIdChanged => "local_log_storage_generation_continuity.profile_id_changed",
            Self::ProfileVersionChanged => {
                "local_log_storage_generation_continuity.profile_version_changed"
            }
            Self::ScopeIdChanged => "local_log_storage_generation_continuity.scope_id_changed",
            Self::SessionIdChanged => "local_log_storage_generation_continuity.session_id_changed",
            Self::ExpectedHeadMismatch => {
                "local_log_storage_generation_continuity.expected_head_mismatch"
            }
            Self::SealedLogMismatch => {
                "local_log_storage_generation_continuity.sealed_log_mismatch"
            }
            Self::SealedFrameMismatch => {
                "local_log_storage_generation_continuity.sealed_frame_mismatch"
            }
            Self::TransactionIdReused => {
                "local_log_storage_generation_continuity.transaction_id_reused"
            }
            Self::KnownHeadIdReused => {
                "local_log_storage_generation_continuity.known_head_id_reused"
            }
            Self::KnownGenerationIdReused => {
                "local_log_storage_generation_continuity.known_generation_id_reused"
            }
            Self::KnownFenceIdReused => {
                "local_log_storage_generation_continuity.known_fence_id_reused"
            }
        }
    }
}

/// Why one manifest does not continue the supplied validated prior manifest.
#[derive(Clone, Copy, Debug, Eq, Error, PartialEq)]
#[non_exhaustive]
pub enum LocalLogStorageGenerationContinuityError {
    /// The storage profile identity changed.
    #[error("storage-generation rotation changed storage profile identity")]
    ProfileIdChanged,
    /// The storage profile contract version changed.
    #[error("storage-generation rotation changed storage profile version")]
    ProfileVersionChanged,
    /// The storage scope identity changed.
    #[error("storage-generation rotation changed storage scope")]
    ScopeIdChanged,
    /// The local-session identity changed.
    #[error("storage-generation rotation changed local session")]
    SessionIdChanged,
    /// The expected head is not the prior manifest's committed head.
    #[error("storage-generation expected head does not select the supplied prior manifest")]
    ExpectedHeadMismatch,
    /// The sealed generation is not the prior manifest's successor.
    #[error("storage-generation sealed log does not continue the prior successor")]
    SealedLogMismatch,
    /// The sealed Frame V1 policy is not the prior successor policy.
    #[error("storage-generation sealed frame policy does not continue the prior successor policy")]
    SealedFrameMismatch,
    /// The new plan reuses its immediately prior transaction identity.
    #[error("storage-generation rotation reuses the prior transaction identity")]
    TransactionIdReused,
    /// The proposed committed head reuses the prior expected head identity.
    #[error("storage-generation committed head reuses a known prior head identity")]
    KnownHeadIdReused,
    /// The new successor reuses the prior sealed generation identity.
    #[error("storage-generation successor reuses a known prior generation identity")]
    KnownGenerationIdReused,
    /// The proposed activation fence reuses the selected value's fence identity.
    #[error("storage-generation rotation reuses a known activation fence identity")]
    KnownFenceIdReused,
}

impl LocalLogStorageGenerationContinuityError {
    /// Returns the stable continuity failure category.
    #[must_use]
    pub const fn code(self) -> LocalLogStorageGenerationContinuityErrorCode {
        match self {
            Self::ProfileIdChanged => {
                LocalLogStorageGenerationContinuityErrorCode::ProfileIdChanged
            }
            Self::ProfileVersionChanged => {
                LocalLogStorageGenerationContinuityErrorCode::ProfileVersionChanged
            }
            Self::ScopeIdChanged => LocalLogStorageGenerationContinuityErrorCode::ScopeIdChanged,
            Self::SessionIdChanged => {
                LocalLogStorageGenerationContinuityErrorCode::SessionIdChanged
            }
            Self::ExpectedHeadMismatch => {
                LocalLogStorageGenerationContinuityErrorCode::ExpectedHeadMismatch
            }
            Self::SealedLogMismatch => {
                LocalLogStorageGenerationContinuityErrorCode::SealedLogMismatch
            }
            Self::SealedFrameMismatch => {
                LocalLogStorageGenerationContinuityErrorCode::SealedFrameMismatch
            }
            Self::TransactionIdReused => {
                LocalLogStorageGenerationContinuityErrorCode::TransactionIdReused
            }
            Self::KnownHeadIdReused => {
                LocalLogStorageGenerationContinuityErrorCode::KnownHeadIdReused
            }
            Self::KnownGenerationIdReused => {
                LocalLogStorageGenerationContinuityErrorCode::KnownGenerationIdReused
            }
            Self::KnownFenceIdReused => {
                LocalLogStorageGenerationContinuityErrorCode::KnownFenceIdReused
            }
        }
    }
}

/// Stable category for a storage-generation semantic resource rejection.
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[non_exhaustive]
pub enum LocalLogStorageGenerationResourceLimitCode {
    /// Decoded `checkpointJson` exceeds its independent ceiling.
    CheckpointJsonBytes,
}

impl LocalLogStorageGenerationResourceLimitCode {
    /// Returns the stable code used across language boundaries.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::CheckpointJsonBytes => {
                "local_log_storage_generation_resource.checkpoint_json_bytes"
            }
        }
    }
}

/// A semantic resource ceiling exceeded by one complete manifest.
#[derive(Clone, Copy, Debug, Eq, Error, PartialEq)]
#[non_exhaustive]
pub enum LocalLogStorageGenerationResourceLimit {
    /// Decoded nested checkpoint JSON exceeds host policy.
    #[error(
        "storage-generation checkpoint JSON requires at least {minimum} bytes; the configured maximum is {maximum}"
    )]
    CheckpointJsonBytes {
        /// Exact size or first observed size above the ceiling.
        minimum: usize,
        /// Host-authoritative maximum.
        maximum: usize,
    },
}

impl LocalLogStorageGenerationResourceLimit {
    /// Returns the stable resource failure category.
    #[must_use]
    pub const fn code(self) -> LocalLogStorageGenerationResourceLimitCode {
        match self {
            Self::CheckpointJsonBytes { .. } => {
                LocalLogStorageGenerationResourceLimitCode::CheckpointJsonBytes
            }
        }
    }
}

/// A typed failure while preparing, decoding, or encoding one V1 rotation.
#[derive(Debug, Error)]
#[non_exhaustive]
pub enum LocalLogStorageGenerationCodecError {
    /// The outcome checkpoint was proved under another runtime context.
    #[error("storage-generation codec context differs from the supplied checkpoint context")]
    ContextConfigurationMismatch,
    /// The complete input exceeds the independent manifest-input limit.
    #[error("storage-generation JSON is {actual} bytes; the configured maximum is {maximum}")]
    InputTooLarge {
        /// Actual input size.
        actual: usize,
        /// Maximum accepted input size.
        maximum: usize,
    },
    /// A deterministic encoding exceeds the independent manifest-output limit.
    #[error(
        "encoded storage-generation JSON exceeds the configured maximum {maximum}; at least {minimum} bytes were observed"
    )]
    OutputTooLarge {
        /// Exact size or lower bound observed before serialization stopped.
        minimum: usize,
        /// Maximum accepted output size.
        maximum: usize,
    },
    /// Outer JSON syntax or strict object shape is invalid.
    #[error("invalid storage-generation JSON: {0}")]
    InvalidJson(LocalLogStorageGenerationJsonFailure),
    /// The envelope does not identify Breditor's storage-generation format.
    #[error("unsupported storage-generation format; expected `{expected}`")]
    UnsupportedFormat {
        /// Format accepted by this codec.
        expected: &'static str,
    },
    /// The envelope uses an unsupported wire version.
    #[error(
        "unsupported storage-generation format version {found}; this codec supports {supported}"
    )]
    UnsupportedFormatVersion {
        /// Version found in the input.
        found: u32,
        /// Version accepted by this codec.
        supported: u32,
    },
    /// A wire or outcome assertion disagrees with trusted input.
    #[error("storage-generation {field:?} does not match its trusted association")]
    BindingMismatch {
        /// Field that disagreed.
        field: LocalLogStorageGenerationBindingField,
    },
    /// One record field failed checked reconstruction.
    #[error(transparent)]
    InvalidRecord(#[from] LocalLogStorageGenerationRecordError),
    /// One record or rotation edge has impossible identity topology.
    #[error(transparent)]
    InvalidTopology(#[from] LocalLogStorageGenerationTopologyError),
    /// The value does not continue the supplied validated prior manifest.
    #[error(transparent)]
    InvalidContinuity(#[from] LocalLogStorageGenerationContinuityError),
    /// One host-authoritative semantic resource ceiling was exceeded.
    #[error(transparent)]
    ResourceLimit(#[from] LocalLogStorageGenerationResourceLimit),
    /// The embedded Checkpoint V1 failed strict reconstruction or encoding.
    ///
    /// Only its stable broad category is retained. Nested diagnostics and the
    /// source chain are dropped at this payload-redaction boundary.
    #[error("invalid nested local-log checkpoint ({0:?})")]
    InvalidCheckpoint(CodecErrorCode),
    /// The decoded checkpoint string is not exact canonical Checkpoint V1 output.
    #[error("storage-generation checkpoint JSON is not canonical Checkpoint V1 output")]
    NonCanonicalCheckpointJson,
    /// The complete input is not the exact canonical outer encoding.
    #[error("storage-generation JSON is not its canonical V1 byte encoding")]
    NonCanonicalManifestJson,
    /// A private checked runtime invariant failed after validation.
    #[error("storage-generation runtime invariant failed: {diagnostic}")]
    RuntimeInvariant {
        /// Bounded payload-free diagnostic.
        diagnostic: BoundedDiagnostic,
    },
    /// Serialization of a checked value failed.
    #[error("could not encode storage-generation JSON: {0}")]
    Encoding(LocalLogStorageGenerationJsonFailure),
}

impl LocalLogStorageGenerationCodecError {
    /// Returns the stable machine-readable failure category.
    #[must_use]
    pub const fn code(&self) -> CodecErrorCode {
        match self {
            Self::ContextConfigurationMismatch => CodecErrorCode::ContextMismatch,
            Self::InputTooLarge { .. } => CodecErrorCode::InputTooLarge,
            Self::OutputTooLarge { .. } => CodecErrorCode::OutputTooLarge,
            Self::InvalidJson(_) => CodecErrorCode::InvalidJson,
            Self::UnsupportedFormat { .. } => CodecErrorCode::UnsupportedFormat,
            Self::UnsupportedFormatVersion { .. } => CodecErrorCode::UnsupportedFormatVersion,
            Self::ResourceLimit(_) => CodecErrorCode::ResourceLimit,
            Self::InvalidCheckpoint(code) => *code,
            Self::Encoding(_) => CodecErrorCode::EncodingFailed,
            Self::BindingMismatch { .. }
            | Self::InvalidRecord(_)
            | Self::InvalidTopology(_)
            | Self::InvalidContinuity(_)
            | Self::NonCanonicalCheckpointJson
            | Self::NonCanonicalManifestJson
            | Self::RuntimeInvariant { .. } => CodecErrorCode::InvalidLocalLogStorageGeneration,
        }
    }
}

#[cfg(test)]
mod tests {
    use std::error::Error as _;

    use serde::Deserialize;

    use super::{
        CodecErrorCode, LocalLogStorageGenerationBindingField, LocalLogStorageGenerationCodecError,
        LocalLogStorageGenerationContinuityError, LocalLogStorageGenerationContinuityErrorCode,
        LocalLogStorageGenerationRecordErrorCode, LocalLogStorageGenerationResourceLimit,
        LocalLogStorageGenerationResourceLimitCode, LocalLogStorageGenerationTopologyError,
        LocalLogStorageGenerationTopologyErrorCode,
    };

    #[test]
    fn stable_subcodes_are_independent_from_display_text() {
        assert_eq!(
            LocalLogStorageGenerationRecordErrorCode::InvalidAcceptedPrefixBytes.as_str(),
            "local_log_storage_generation_record.invalid_accepted_prefix_bytes"
        );
        assert_eq!(
            LocalLogStorageGenerationTopologyError::HeadNotAdvanced.code(),
            LocalLogStorageGenerationTopologyErrorCode::HeadNotAdvanced
        );
        assert_eq!(
            LocalLogStorageGenerationContinuityError::KnownHeadIdReused.code(),
            LocalLogStorageGenerationContinuityErrorCode::KnownHeadIdReused
        );
        assert_eq!(
            LocalLogStorageGenerationResourceLimit::CheckpointJsonBytes { minimum: 2, maximum: 1 }
                .code(),
            LocalLogStorageGenerationResourceLimitCode::CheckpointJsonBytes
        );
        assert_eq!(LocalLogStorageGenerationBindingField::SealedFrame.as_str(), "sealedFrame");

        let nested = LocalLogStorageGenerationCodecError::InvalidCheckpoint(
            CodecErrorCode::UnsupportedFormat,
        );
        assert_eq!(nested.code(), CodecErrorCode::UnsupportedFormat);
        assert!(nested.source().is_none());
        assert_eq!(nested.to_string(), "invalid nested local-log checkpoint (UnsupportedFormat)");
    }

    #[derive(Deserialize)]
    #[serde(deny_unknown_fields)]
    struct ExactRecord {
        #[serde(rename = "known")]
        _known: u32,
    }

    #[test]
    fn every_untrusted_json_projection_drops_payload_text_and_sources()
    -> Result<(), Box<dyn std::error::Error>> {
        const WRONG_TYPE_SENTINEL: &str = "outer-wrong-type-sentinel";
        const UNKNOWN_FIELD_SENTINEL: &str = "outer_unknown_field_sentinel";
        const FORMAT_SENTINEL: &str = "attacker/format-sentinel";
        const NESTED_SENTINEL: &str = "nested-wrong-type-sentinel";

        let wrong_type_json = format!("\"{WRONG_TYPE_SENTINEL}\"");
        let wrong_type = serde_json::from_str::<u32>(&wrong_type_json)
            .err()
            .ok_or("wrong-type sentinel unexpectedly decoded as u32")?;
        let unknown_field_json = format!("{{\"known\":1,\"{UNKNOWN_FIELD_SENTINEL}\":2}}");
        let unknown_field = serde_json::from_str::<ExactRecord>(&unknown_field_json)
            .err()
            .ok_or("unknown-field sentinel unexpectedly passed an exact record")?;

        let errors = [
            LocalLogStorageGenerationCodecError::InvalidJson(
                super::LocalLogStorageGenerationJsonFailure::from_serde(&wrong_type),
            ),
            LocalLogStorageGenerationCodecError::InvalidJson(
                super::LocalLogStorageGenerationJsonFailure::from_serde(&unknown_field),
            ),
            LocalLogStorageGenerationCodecError::UnsupportedFormat {
                expected: super::super::local_log_storage_generation_json::LOCAL_LOG_STORAGE_GENERATION_FORMAT,
            },
            LocalLogStorageGenerationCodecError::InvalidCheckpoint(CodecErrorCode::InvalidJson),
        ];
        let sentinels =
            [WRONG_TYPE_SENTINEL, UNKNOWN_FIELD_SENTINEL, FORMAT_SENTINEL, NESTED_SENTINEL];
        for error in errors {
            assert_payload_free_error_chain(&error, &sentinels);
        }
        Ok(())
    }

    fn assert_payload_free_error_chain(
        error: &LocalLogStorageGenerationCodecError,
        sentinels: &[&str],
    ) {
        assert_payload_free_text(&error.to_string(), sentinels);
        assert_payload_free_text(&format!("{error:?}"), sentinels);

        let mut source = error.source();
        while let Some(current) = source {
            assert_payload_free_text(&current.to_string(), sentinels);
            assert_payload_free_text(&format!("{current:?}"), sentinels);
            source = current.source();
        }
    }

    fn assert_payload_free_text(text: &str, sentinels: &[&str]) {
        for sentinel in sentinels {
            assert!(!text.contains(sentinel), "diagnostic leaked sentinel `{sentinel}`: {text}");
        }
    }
}

use std::{error::Error, fmt};

use thiserror::Error;

use super::{BoundedDiagnostic, CodecErrorCode, JsonFailureKind};

/// Payload-free JSON failure metadata for the storage-root boundary.
///
/// Parser and serializer messages are deliberately discarded because they can
/// quote attacker-controlled values or object keys. Coordinates do not retain
/// any candidate bytes.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct LocalLogStorageRootJsonFailure {
    kind: JsonFailureKind,
    line: usize,
    column: usize,
}

impl LocalLogStorageRootJsonFailure {
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

impl fmt::Display for LocalLogStorageRootJsonFailure {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(formatter, "{:?} failure at line {}, column {}", self.kind, self.line, self.column)
    }
}

/// Stable checked-field category for Storage Root V1.
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[non_exhaustive]
pub enum LocalLogStorageRootRecordErrorCode {
    /// `profileId` is not a valid qualified storage-profile name.
    InvalidProfileId,
    /// `profileVersion` is zero or not a fixed-width unsigned integer.
    InvalidProfileVersion,
    /// `scopeId` is not a valid storage-scope identity.
    InvalidScopeId,
    /// `transactionId` is not a valid storage-transaction identity.
    InvalidTransactionId,
    /// `committedHeadId` is not a valid storage-head identity.
    InvalidCommittedHeadId,
    /// `fenceId` is not a valid non-secret fence correlation identity.
    InvalidFenceId,
    /// `sessionId` is not a valid local-session identity.
    InvalidSessionId,
    /// `checkpointLogId` is not a valid local-log identity.
    InvalidCheckpointLogId,
    /// `activeLogId` is not a valid local-log identity.
    InvalidActiveLogId,
    /// `activeFrame.formatVersion` is not Frame V1.
    InvalidActiveFrameFormatVersion,
    /// `activeFrame.maxPayloadBytes` is not a canonical decimal-string `u64`.
    InvalidActiveFrameMaxPayloadBytes,
}

impl LocalLogStorageRootRecordErrorCode {
    /// Returns the stable code used across language boundaries.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::InvalidProfileId => "local_log_storage_root_record.invalid_profile_id",
            Self::InvalidProfileVersion => "local_log_storage_root_record.invalid_profile_version",
            Self::InvalidScopeId => "local_log_storage_root_record.invalid_scope_id",
            Self::InvalidTransactionId => "local_log_storage_root_record.invalid_transaction_id",
            Self::InvalidCommittedHeadId => {
                "local_log_storage_root_record.invalid_committed_head_id"
            }
            Self::InvalidFenceId => "local_log_storage_root_record.invalid_fence_id",
            Self::InvalidSessionId => "local_log_storage_root_record.invalid_session_id",
            Self::InvalidCheckpointLogId => {
                "local_log_storage_root_record.invalid_checkpoint_log_id"
            }
            Self::InvalidActiveLogId => "local_log_storage_root_record.invalid_active_log_id",
            Self::InvalidActiveFrameFormatVersion => {
                "local_log_storage_root_record.invalid_active_frame_format_version"
            }
            Self::InvalidActiveFrameMaxPayloadBytes => {
                "local_log_storage_root_record.invalid_active_frame_max_payload_bytes"
            }
        }
    }
}

/// Stable location within Storage Root V1.
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[non_exhaustive]
pub enum LocalLogStorageRootRecordLocation {
    /// Top-level `profileId`.
    ProfileId,
    /// Top-level `profileVersion`.
    ProfileVersion,
    /// Top-level `scopeId`.
    ScopeId,
    /// Top-level `transactionId`.
    TransactionId,
    /// Top-level `committedHeadId`.
    CommittedHeadId,
    /// Top-level `fenceId`.
    FenceId,
    /// Top-level `sessionId`.
    SessionId,
    /// Top-level `checkpointLogId`.
    CheckpointLogId,
    /// Top-level `activeLogId`.
    ActiveLogId,
    /// Nested `activeFrame.formatVersion`.
    ActiveFrameFormatVersion,
    /// Nested `activeFrame.maxPayloadBytes`.
    ActiveFrameMaxPayloadBytes,
}

/// Breditor-owned details for one invalid root field.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct LocalLogStorageRootRecordError {
    code: LocalLogStorageRootRecordErrorCode,
    location: LocalLogStorageRootRecordLocation,
    diagnostic: BoundedDiagnostic,
}

impl LocalLogStorageRootRecordError {
    /// Returns the stable reconstruction failure category.
    #[must_use]
    pub const fn code(&self) -> LocalLogStorageRootRecordErrorCode {
        self.code
    }

    /// Returns the stable rejected-field location.
    #[must_use]
    pub const fn location(&self) -> LocalLogStorageRootRecordLocation {
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
        code: LocalLogStorageRootRecordErrorCode,
        location: LocalLogStorageRootRecordLocation,
        diagnostic: impl Into<BoundedDiagnostic>,
    ) -> Self {
        Self { code, location, diagnostic: diagnostic.into() }
    }
}

impl fmt::Display for LocalLogStorageRootRecordError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            formatter,
            "invalid local-log-storage-root record at {:?}: {}",
            self.location, self.diagnostic
        )
    }
}

impl Error for LocalLogStorageRootRecordError {}

/// Trusted field that disagreed with one root selection assertion.
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[non_exhaustive]
pub enum LocalLogStorageRootBindingField {
    /// Storage profile identity.
    ProfileId,
    /// Storage profile contract version.
    ProfileVersion,
    /// Storage scope identity.
    ScopeId,
    /// First authoritative head identity.
    CommittedHeadId,
}

impl LocalLogStorageRootBindingField {
    /// Returns the corresponding V1 field spelling.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::ProfileId => "profileId",
            Self::ProfileVersion => "profileVersion",
            Self::ScopeId => "scopeId",
            Self::CommittedHeadId => "committedHeadId",
        }
    }
}

/// Stable category for an impossible root topology.
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[non_exhaustive]
pub enum LocalLogStorageRootTopologyErrorCode {
    /// Checkpoint and active generation identities are equal.
    GenerationNotAdvanced,
}

impl LocalLogStorageRootTopologyErrorCode {
    /// Returns the stable code used across language boundaries.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::GenerationNotAdvanced => {
                "local_log_storage_root_topology.generation_not_advanced"
            }
        }
    }
}

/// Why individually valid fields cannot describe one initial root topology.
#[derive(Clone, Copy, Debug, Eq, Error, PartialEq)]
#[non_exhaustive]
pub enum LocalLogStorageRootTopologyError {
    /// One root reuses its checkpoint generation as its active generation.
    #[error("storage root must advance to a distinct active generation")]
    GenerationNotAdvanced,
}

impl LocalLogStorageRootTopologyError {
    /// Returns the stable topology failure category.
    #[must_use]
    pub const fn code(self) -> LocalLogStorageRootTopologyErrorCode {
        match self {
            Self::GenerationNotAdvanced => {
                LocalLogStorageRootTopologyErrorCode::GenerationNotAdvanced
            }
        }
    }
}

/// Stable category for a storage-root semantic resource rejection.
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[non_exhaustive]
pub enum LocalLogStorageRootResourceLimitCode {
    /// Decoded `checkpointJson` exceeds its independent ceiling.
    CheckpointJsonBytes,
}

impl LocalLogStorageRootResourceLimitCode {
    /// Returns the stable code used across language boundaries.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::CheckpointJsonBytes => "local_log_storage_root_resource.checkpoint_json_bytes",
        }
    }
}

/// A semantic resource ceiling exceeded by one complete root selection.
#[derive(Clone, Copy, Debug, Eq, Error, PartialEq)]
#[non_exhaustive]
pub enum LocalLogStorageRootResourceLimit {
    /// Decoded nested checkpoint JSON exceeds host policy.
    #[error(
        "storage-root checkpoint JSON requires at least {minimum} bytes; the configured maximum is {maximum}"
    )]
    CheckpointJsonBytes {
        /// Exact size or first observed size above the ceiling.
        minimum: usize,
        /// Host-authoritative maximum.
        maximum: usize,
    },
}

impl LocalLogStorageRootResourceLimit {
    /// Returns the stable resource failure category.
    #[must_use]
    pub const fn code(self) -> LocalLogStorageRootResourceLimitCode {
        match self {
            Self::CheckpointJsonBytes { .. } => {
                LocalLogStorageRootResourceLimitCode::CheckpointJsonBytes
            }
        }
    }
}

/// A typed failure while preparing, decoding, or encoding one V1 root.
#[derive(Debug, Error)]
#[non_exhaustive]
pub enum LocalLogStorageRootCodecError {
    /// The outcome checkpoint was proved under another runtime context.
    #[error("storage-root codec context differs from the supplied checkpoint context")]
    ContextConfigurationMismatch,
    /// The complete input exceeds the independent root-input limit.
    #[error("storage-root JSON is {actual} bytes; the configured maximum is {maximum}")]
    InputTooLarge {
        /// Actual input size.
        actual: usize,
        /// Maximum accepted input size.
        maximum: usize,
    },
    /// A deterministic encoding exceeds the independent root-output limit.
    #[error(
        "encoded storage-root JSON exceeds the configured maximum {maximum}; at least {minimum} bytes were observed"
    )]
    OutputTooLarge {
        /// Exact size or lower bound observed before serialization stopped.
        minimum: usize,
        /// Maximum accepted output size.
        maximum: usize,
    },
    /// Outer JSON syntax or strict object shape is invalid.
    #[error("invalid storage-root JSON: {0}")]
    InvalidJson(LocalLogStorageRootJsonFailure),
    /// The envelope does not identify Breditor's storage-root format.
    #[error("unsupported storage-root format; expected `{expected}`")]
    UnsupportedFormat {
        /// Format accepted by this codec.
        expected: &'static str,
    },
    /// The envelope uses an unsupported wire version.
    #[error("unsupported storage-root format version {found}; this codec supports {supported}")]
    UnsupportedFormatVersion {
        /// Version found in the input.
        found: u32,
        /// Version accepted by this codec.
        supported: u32,
    },
    /// A root assertion disagrees with independently trusted input.
    #[error("storage-root {field:?} does not match its trusted association")]
    BindingMismatch {
        /// Field that disagreed.
        field: LocalLogStorageRootBindingField,
    },
    /// One record field failed checked reconstruction.
    #[error(transparent)]
    InvalidRecord(#[from] LocalLogStorageRootRecordError),
    /// The root names one impossible generation topology.
    #[error(transparent)]
    InvalidTopology(#[from] LocalLogStorageRootTopologyError),
    /// One host-authoritative semantic resource ceiling was exceeded.
    #[error(transparent)]
    ResourceLimit(#[from] LocalLogStorageRootResourceLimit),
    /// The embedded Checkpoint V1 failed strict reconstruction or encoding.
    ///
    /// Only its stable broad category is retained. Nested diagnostics and the
    /// source chain are dropped at this payload-redaction boundary.
    #[error("invalid nested local-log checkpoint ({0:?})")]
    InvalidCheckpoint(CodecErrorCode),
    /// The decoded checkpoint string is not exact canonical Checkpoint V1 output.
    #[error("storage-root checkpoint JSON is not canonical Checkpoint V1 output")]
    NonCanonicalCheckpointJson,
    /// The complete input is not the exact canonical outer encoding.
    #[error("storage-root JSON is not its canonical V1 byte encoding")]
    NonCanonicalRootJson,
    /// A private checked runtime invariant failed after validation.
    #[error("storage-root runtime invariant failed: {diagnostic}")]
    RuntimeInvariant {
        /// Bounded payload-free diagnostic.
        diagnostic: BoundedDiagnostic,
    },
    /// Serialization of a checked value failed.
    #[error("could not encode storage-root JSON: {0}")]
    Encoding(LocalLogStorageRootJsonFailure),
}

impl LocalLogStorageRootCodecError {
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
            | Self::NonCanonicalCheckpointJson
            | Self::NonCanonicalRootJson
            | Self::RuntimeInvariant { .. } => CodecErrorCode::InvalidLocalLogStorageRoot,
        }
    }
}

#[cfg(test)]
mod tests {
    use std::error::Error as _;

    use serde::Deserialize;

    use super::{
        CodecErrorCode, LocalLogStorageRootBindingField, LocalLogStorageRootCodecError,
        LocalLogStorageRootRecordErrorCode, LocalLogStorageRootResourceLimit,
        LocalLogStorageRootResourceLimitCode, LocalLogStorageRootTopologyError,
        LocalLogStorageRootTopologyErrorCode,
    };

    #[test]
    fn stable_subcodes_are_independent_from_display_text() {
        assert_eq!(
            LocalLogStorageRootRecordErrorCode::InvalidActiveLogId.as_str(),
            "local_log_storage_root_record.invalid_active_log_id"
        );
        assert_eq!(
            LocalLogStorageRootTopologyError::GenerationNotAdvanced.code(),
            LocalLogStorageRootTopologyErrorCode::GenerationNotAdvanced
        );
        assert_eq!(
            LocalLogStorageRootResourceLimit::CheckpointJsonBytes { minimum: 2, maximum: 1 }.code(),
            LocalLogStorageRootResourceLimitCode::CheckpointJsonBytes
        );
        assert_eq!(LocalLogStorageRootBindingField::CommittedHeadId.as_str(), "committedHeadId");

        let nested =
            LocalLogStorageRootCodecError::InvalidCheckpoint(CodecErrorCode::UnsupportedFormat);
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

        let wrong_type = serde_json::from_str::<u32>(&format!("\"{WRONG_TYPE_SENTINEL}\""))
            .err()
            .ok_or("wrong-type sentinel unexpectedly decoded as u32")?;
        let unknown_field = serde_json::from_str::<ExactRecord>(&format!(
            "{{\"known\":1,\"{UNKNOWN_FIELD_SENTINEL}\":2}}"
        ))
        .err()
        .ok_or("unknown-field sentinel unexpectedly passed an exact record")?;
        let sentinels = [WRONG_TYPE_SENTINEL, UNKNOWN_FIELD_SENTINEL];
        for error in [wrong_type, unknown_field] {
            let error = LocalLogStorageRootCodecError::InvalidJson(
                super::LocalLogStorageRootJsonFailure::from_serde(&error),
            );
            assert_payload_free_error_chain(&error, &sentinels);
        }
        Ok(())
    }

    fn assert_payload_free_error_chain(error: &LocalLogStorageRootCodecError, sentinels: &[&str]) {
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

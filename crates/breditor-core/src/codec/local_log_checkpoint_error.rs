use std::{error::Error, fmt};

use thiserror::Error;

use super::{BoundedDiagnostic, CodecErrorCode, JsonFailure, SessionCheckpointCodecError};

/// Stable checked-field category for Local Log Checkpoint V1.
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[non_exhaustive]
pub enum LocalLogCheckpointRecordErrorCode {
    /// `sessionId` is not a valid local-session identity.
    InvalidSessionId,
    /// `checkpointLogId` is not a valid local-log identity.
    InvalidCheckpointLogId,
    /// `successorLogId` is not a valid local-log identity.
    InvalidSuccessorLogId,
    /// `coveredThrough` is not null or a canonical nonzero decimal `u64`.
    InvalidCoveredThrough,
    /// One ordered replay tombstone is not a valid replay identity.
    InvalidReplayId,
}

impl LocalLogCheckpointRecordErrorCode {
    /// Returns the stable code used across language boundaries.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::InvalidSessionId => "local_log_checkpoint_record.invalid_session_id",
            Self::InvalidCheckpointLogId => "local_log_checkpoint_record.invalid_checkpoint_log_id",
            Self::InvalidSuccessorLogId => "local_log_checkpoint_record.invalid_successor_log_id",
            Self::InvalidCoveredThrough => "local_log_checkpoint_record.invalid_covered_through",
            Self::InvalidReplayId => "local_log_checkpoint_record.invalid_replay_id",
        }
    }
}

/// Stable location within Local Log Checkpoint V1.
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[non_exhaustive]
pub enum LocalLogCheckpointRecordLocation {
    /// Top-level `sessionId`.
    SessionId,
    /// Top-level `checkpointLogId`.
    CheckpointLogId,
    /// Top-level `successorLogId`.
    SuccessorLogId,
    /// Top-level `coveredThrough`.
    CoveredThrough,
    /// One zero-based `replayTombstones` element.
    ReplayTombstone {
        /// Zero-based chronological tombstone index.
        tombstone_index: u64,
    },
}

/// Breditor-owned details for one invalid checkpoint field.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct LocalLogCheckpointRecordError {
    code: LocalLogCheckpointRecordErrorCode,
    location: LocalLogCheckpointRecordLocation,
    diagnostic: BoundedDiagnostic,
}

impl LocalLogCheckpointRecordError {
    /// Returns the stable reconstruction failure category.
    #[must_use]
    pub const fn code(&self) -> LocalLogCheckpointRecordErrorCode {
        self.code
    }

    /// Returns the stable rejected-field location.
    #[must_use]
    pub const fn location(&self) -> LocalLogCheckpointRecordLocation {
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
        code: LocalLogCheckpointRecordErrorCode,
        location: LocalLogCheckpointRecordLocation,
        diagnostic: impl Into<BoundedDiagnostic>,
    ) -> Self {
        Self { code, location, diagnostic: diagnostic.into() }
    }
}

impl fmt::Display for LocalLogCheckpointRecordError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            formatter,
            "invalid local-log-checkpoint record at {:?}: {}",
            self.location, self.diagnostic
        )
    }
}

impl Error for LocalLogCheckpointRecordError {}

/// Which trusted checkpoint-binding field disagreed with the wire assertion.
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[non_exhaustive]
pub enum LocalLogCheckpointBindingField {
    /// Durable local-session identity.
    SessionId,
    /// Sealed append-generation identity.
    CheckpointLogId,
    /// Bound successor append-generation identity.
    SuccessorLogId,
}

impl LocalLogCheckpointBindingField {
    /// Returns the V1 field spelling.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::SessionId => "sessionId",
            Self::CheckpointLogId => "checkpointLogId",
            Self::SuccessorLogId => "successorLogId",
        }
    }
}

/// Stable category for an impossible checkpoint topology.
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[non_exhaustive]
pub enum LocalLogCheckpointTopologyErrorCode {
    /// The sealed and successor generation identities are equal.
    GenerationNotAdvanced,
    /// The frontier and complete tombstone count disagree.
    TombstoneCountMismatch,
    /// One replay identity occurs at multiple represented sequences.
    DuplicateReplayId,
    /// An empty log prefix carries behaviorally nonempty session history.
    NonGenesisEmptyHistory,
}

impl LocalLogCheckpointTopologyErrorCode {
    /// Returns the stable code used across language boundaries.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::GenerationNotAdvanced => "local_log_checkpoint_topology.generation_not_advanced",
            Self::TombstoneCountMismatch => {
                "local_log_checkpoint_topology.tombstone_count_mismatch"
            }
            Self::DuplicateReplayId => "local_log_checkpoint_topology.duplicate_replay_id",
            Self::NonGenesisEmptyHistory => {
                "local_log_checkpoint_topology.non_genesis_empty_history"
            }
        }
    }
}

/// Why individually valid fields cannot describe one runtime checkpoint.
#[derive(Clone, Debug, Eq, Error, PartialEq)]
#[non_exhaustive]
pub enum LocalLogCheckpointTopologyError {
    /// The transition reuses its sealed generation identity.
    #[error("local-log checkpoint must advance to a distinct successor generation")]
    GenerationNotAdvanced,
    /// Complete tombstones do not exactly cover the declared sequence frontier.
    #[error(
        "local-log checkpoint frontier covers {covered} entries but has {actual} replay tombstones"
    )]
    TombstoneCountMismatch {
        /// Zero for null, otherwise the declared last sequence.
        covered: u64,
        /// Complete number of replay tombstones found.
        actual: u64,
    },
    /// One replay identity appears more than once in chronological order.
    #[error(
        "local-log checkpoint replay identity is duplicated at tombstones {first_index} and {duplicate_index}"
    )]
    DuplicateReplayId {
        /// First zero-based chronological index.
        first_index: u64,
        /// Repeated zero-based chronological index.
        duplicate_index: u64,
    },
    /// No log entries exist, but session history contains retained behavior.
    #[error("empty local-log checkpoint requires genesis-empty session history")]
    NonGenesisEmptyHistory,
}

impl LocalLogCheckpointTopologyError {
    /// Returns the stable topology failure category.
    #[must_use]
    pub const fn code(&self) -> LocalLogCheckpointTopologyErrorCode {
        match self {
            Self::GenerationNotAdvanced => {
                LocalLogCheckpointTopologyErrorCode::GenerationNotAdvanced
            }
            Self::TombstoneCountMismatch { .. } => {
                LocalLogCheckpointTopologyErrorCode::TombstoneCountMismatch
            }
            Self::DuplicateReplayId { .. } => {
                LocalLogCheckpointTopologyErrorCode::DuplicateReplayId
            }
            Self::NonGenesisEmptyHistory => {
                LocalLogCheckpointTopologyErrorCode::NonGenesisEmptyHistory
            }
        }
    }
}

/// Stable category for a local-log-checkpoint resource rejection.
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[non_exhaustive]
pub enum LocalLogCheckpointResourceLimitCode {
    /// Complete replay tombstones exceed host policy.
    ReplayTombstones,
}

impl LocalLogCheckpointResourceLimitCode {
    /// Returns the stable code used across language boundaries.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::ReplayTombstones => "local_log_checkpoint_resource.replay_tombstones",
        }
    }
}

/// A semantic resource ceiling exceeded by one complete checkpoint.
#[derive(Clone, Copy, Debug, Eq, Error, PartialEq)]
#[non_exhaustive]
pub enum LocalLogCheckpointResourceLimit {
    /// The complete tombstone vector exceeds host policy.
    #[error(
        "local-log checkpoint requires at least {actual} replay tombstones; the configured maximum is {maximum}"
    )]
    ReplayTombstones {
        /// Declared required count, or the first observed count above the limit.
        actual: u64,
        /// Host-authoritative maximum.
        maximum: u64,
    },
}

impl LocalLogCheckpointResourceLimit {
    /// Returns the stable resource failure category.
    #[must_use]
    pub const fn code(&self) -> LocalLogCheckpointResourceLimitCode {
        match self {
            Self::ReplayTombstones { .. } => LocalLogCheckpointResourceLimitCode::ReplayTombstones,
        }
    }
}

/// A typed failure while decoding or encoding one complete local-log checkpoint.
#[derive(Debug, Error)]
#[non_exhaustive]
pub enum LocalLogCheckpointCodecError {
    /// The supplied anchor's session was proved under another runtime context.
    #[error("local-log-checkpoint codec context differs from the supplied session context")]
    ContextConfigurationMismatch,
    /// The input exceeds the configured UTF-8 byte limit.
    #[error("local-log-checkpoint JSON is {actual} bytes; the configured maximum is {maximum}")]
    InputTooLarge {
        /// Actual input size.
        actual: usize,
        /// Maximum accepted input size.
        maximum: usize,
    },
    /// A deterministic encoding exceeds the codec's decoding budget.
    #[error(
        "encoded local-log-checkpoint JSON exceeds the configured maximum {maximum}; at least {minimum} bytes were observed"
    )]
    OutputTooLarge {
        /// Lower bound observed before serialization stopped, saturated at `usize::MAX`.
        minimum: usize,
        /// Maximum accepted input size for the same codec.
        maximum: usize,
    },
    /// The outer JSON syntax or strict record shape is invalid.
    #[error("invalid local-log-checkpoint JSON: {0}")]
    InvalidJson(#[source] JsonFailure),
    /// One tombstone element is not a strict JSON string.
    #[error("invalid replay tombstone JSON at index {tombstone_index}: {source}")]
    InvalidReplayTombstoneJson {
        /// Zero-based chronological tombstone index.
        tombstone_index: u64,
        /// Strict element failure.
        #[source]
        source: JsonFailure,
    },
    /// The envelope does not identify Breditor's local-log-checkpoint format.
    #[error("unsupported local-log-checkpoint format `{found}`; expected `{expected}`")]
    UnsupportedFormat {
        /// Format found in the input.
        found: BoundedDiagnostic,
        /// Format accepted by this codec.
        expected: &'static str,
    },
    /// The envelope uses an unsupported wire version.
    #[error(
        "unsupported local-log-checkpoint format version {found}; this codec supports {supported}"
    )]
    UnsupportedFormatVersion {
        /// Version found in the input.
        found: u32,
        /// Version accepted by this codec.
        supported: u32,
    },
    /// An untrusted identity assertion disagrees with the trusted codec binding.
    #[error("local-log-checkpoint {field:?} does not match its trusted binding")]
    BindingMismatch {
        /// Identity field that disagreed.
        field: LocalLogCheckpointBindingField,
    },
    /// One identity, frontier, or tombstone failed checked reconstruction.
    #[error(transparent)]
    InvalidRecord(#[from] LocalLogCheckpointRecordError),
    /// Generation, frontier, tombstone, or empty-history topology is inconsistent.
    #[error(transparent)]
    InvalidTopology(#[from] LocalLogCheckpointTopologyError),
    /// One host-authoritative semantic resource ceiling was exceeded.
    #[error(transparent)]
    ResourceLimit(#[from] LocalLogCheckpointResourceLimit),
    /// The embedded complete Session Checkpoint V1 failed its codec boundary.
    #[error("invalid nested session checkpoint: {0}")]
    InvalidSessionCheckpoint(#[source] SessionCheckpointCodecError),
    /// A private checked anchor invariant failed after complete validation.
    #[error("local-log-checkpoint runtime invariant failed: {diagnostic}")]
    RuntimeInvariant {
        /// Bounded diagnostic retaining no session, editor state, or replay ID.
        diagnostic: BoundedDiagnostic,
    },
    /// Serialization of a checked checkpoint failed.
    #[error("could not encode local-log-checkpoint JSON: {0}")]
    Encoding(#[source] JsonFailure),
}

impl LocalLogCheckpointCodecError {
    /// Returns the stable machine-readable failure category.
    #[must_use]
    pub const fn code(&self) -> CodecErrorCode {
        match self {
            Self::ContextConfigurationMismatch => CodecErrorCode::ContextMismatch,
            Self::InputTooLarge { .. } => CodecErrorCode::InputTooLarge,
            Self::OutputTooLarge { .. } => CodecErrorCode::OutputTooLarge,
            Self::InvalidJson(_) | Self::InvalidReplayTombstoneJson { .. } => {
                CodecErrorCode::InvalidJson
            }
            Self::UnsupportedFormat { .. } => CodecErrorCode::UnsupportedFormat,
            Self::UnsupportedFormatVersion { .. } => CodecErrorCode::UnsupportedFormatVersion,
            Self::ResourceLimit(_) => CodecErrorCode::ResourceLimit,
            Self::InvalidSessionCheckpoint(source) => source.code(),
            Self::BindingMismatch { .. }
            | Self::InvalidRecord(_)
            | Self::InvalidTopology(_)
            | Self::RuntimeInvariant { .. } => CodecErrorCode::InvalidLocalLogCheckpoint,
            Self::Encoding(_) => CodecErrorCode::EncodingFailed,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{
        LocalLogCheckpointBindingField, LocalLogCheckpointRecordErrorCode,
        LocalLogCheckpointResourceLimit, LocalLogCheckpointResourceLimitCode,
        LocalLogCheckpointTopologyError, LocalLogCheckpointTopologyErrorCode,
    };

    #[test]
    fn stable_subcodes_do_not_depend_on_display_text() {
        assert_eq!(
            LocalLogCheckpointRecordErrorCode::InvalidCoveredThrough.as_str(),
            "local_log_checkpoint_record.invalid_covered_through"
        );
        assert_eq!(
            LocalLogCheckpointTopologyError::DuplicateReplayId {
                first_index: 1,
                duplicate_index: 7,
            }
            .code(),
            LocalLogCheckpointTopologyErrorCode::DuplicateReplayId
        );
        assert_eq!(
            LocalLogCheckpointResourceLimit::ReplayTombstones { actual: 2, maximum: 1 }.code(),
            LocalLogCheckpointResourceLimitCode::ReplayTombstones
        );
        assert_eq!(LocalLogCheckpointBindingField::SuccessorLogId.as_str(), "successorLogId");
    }
}

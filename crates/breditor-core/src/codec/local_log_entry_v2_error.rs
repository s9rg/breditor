use thiserror::Error;

use crate::{
    identity::QualifiedNameError,
    local_log::LocalLogEventError,
    schema::{SchemaBindingError, SchemaFingerprintParseError, SchemaVersionError},
};

use super::{
    BoundedDiagnostic, CodecErrorCode, CommitV2CodecError, JsonFailure, LocalLogCommitEventKind,
    LocalLogEntryRecordError,
};

/// A typed failure while decoding or encoding one Local Log Entry V2 value.
#[derive(Debug, Error)]
#[non_exhaustive]
pub enum LocalLogEntryV2CodecError {
    /// A nested event commit was proved under another complete runtime context.
    #[error("local-log-entry V2 codec context differs from its event commit context")]
    ContextConfigurationMismatch,
    /// The input exceeds the configured UTF-8 byte limit.
    #[error("local-log-entry V2 JSON is {actual} bytes; the configured maximum is {maximum}")]
    InputTooLarge {
        /// Actual input size.
        actual: usize,
        /// Maximum accepted input size.
        maximum: usize,
    },
    /// A deterministic encoding exceeds the codec's decoding budget.
    #[error(
        "encoded local-log-entry V2 JSON exceeds the configured maximum {maximum}; at least {minimum} bytes were observed"
    )]
    OutputTooLarge {
        /// Lower bound observed before serialization stopped, saturated at `usize::MAX`.
        minimum: usize,
        /// Maximum accepted input size for the same codec.
        maximum: usize,
    },
    /// The outer JSON syntax or strict V2 record/event shape is invalid.
    #[error("invalid local-log-entry V2 JSON: {0}")]
    InvalidJson(#[source] JsonFailure),
    /// The envelope does not identify Breditor's local-log-entry format.
    #[error("unsupported local-log-entry format `{found}`; expected `{expected}`")]
    UnsupportedFormat {
        /// Format found in the input.
        found: BoundedDiagnostic,
        /// Format accepted by this codec.
        expected: &'static str,
    },
    /// The envelope uses a wire version other than Local Log Entry V2.
    #[error("unsupported local-log-entry format version {found}; this codec supports {supported}")]
    UnsupportedFormatVersion {
        /// Version found in the input.
        found: u32,
        /// Version accepted by this codec.
        supported: u32,
    },
    /// The encoded schema name is malformed.
    #[error("invalid encoded schema name `{value}`: {source}")]
    InvalidSchemaName {
        /// Encoded schema-name preview.
        value: BoundedDiagnostic,
        /// Qualified-name validation failure.
        #[source]
        source: QualifiedNameError,
    },
    /// The encoded schema version is reserved or invalid.
    #[error("invalid encoded schema version {value}: {source}")]
    InvalidSchemaVersion {
        /// Encoded numeric schema version.
        value: u32,
        /// Schema-version validation failure.
        #[source]
        source: SchemaVersionError,
    },
    /// The encoded fingerprint text is not canonical.
    #[error("invalid encoded schema fingerprint: {0}")]
    InvalidSchemaFingerprint(#[from] SchemaFingerprintParseError),
    /// The parsed or retained durable binding does not match the codec schema.
    #[error(transparent)]
    SchemaBinding(#[from] SchemaBindingError),
    /// One identity or sequence field failed checked reconstruction.
    #[error(transparent)]
    InvalidRecord(#[from] LocalLogEntryRecordError),
    /// A commit-bearing event failed the authoritative Commit V2 boundary.
    #[error("invalid {event_kind} event Commit V2 value: {source}")]
    InvalidCommit {
        /// Event kind that owned the nested commit.
        event_kind: LocalLogCommitEventKind,
        /// Complete nested Commit V2 codec failure.
        #[source]
        source: Box<CommitV2CodecError>,
    },
    /// A proved nested commit violates its tagged undo or redo event contract.
    #[error("invalid local-log V2 replay event commit: {0}")]
    InvalidEventCommit(#[source] LocalLogEventError),
    /// A private runtime event disagrees with its invariant-bearing discriminator.
    #[error("local-log-entry V2 runtime invariant failed: {diagnostic}")]
    RuntimeInvariant {
        /// Bounded diagnostic that retains no commit or editor state.
        diagnostic: BoundedDiagnostic,
    },
    /// Serialization of a checked V2 entry failed.
    #[error("could not encode local-log-entry V2 JSON: {0}")]
    Encoding(#[source] JsonFailure),
}

impl LocalLogEntryV2CodecError {
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
            Self::InvalidSchemaName { .. } => CodecErrorCode::InvalidSchemaName,
            Self::InvalidSchemaVersion { .. } => CodecErrorCode::InvalidSchemaVersion,
            Self::InvalidSchemaFingerprint(_) => CodecErrorCode::InvalidSchemaFingerprint,
            Self::SchemaBinding(_) => CodecErrorCode::SchemaMismatch,
            Self::InvalidCommit { source, .. } => source.code(),
            Self::InvalidRecord(_)
            | Self::InvalidEventCommit(_)
            | Self::RuntimeInvariant { .. } => CodecErrorCode::InvalidLocalLogEntry,
            Self::Encoding(_) => CodecErrorCode::EncodingFailed,
        }
    }
}

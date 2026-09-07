use thiserror::Error;

use crate::{
    identity::QualifiedNameError,
    schema::{SchemaBindingError, SchemaFingerprintParseError, SchemaVersionError},
};

use super::{
    BoundedDiagnostic, CodecErrorCode, JsonFailure, LocalLogCheckpointCodecError,
    SessionCheckpointV2CodecError,
};

/// A typed failure while decoding or encoding one Local Log Checkpoint V2 value.
#[derive(Debug, Error)]
#[non_exhaustive]
pub enum LocalLogCheckpointV2CodecError {
    /// The retained session was proved under a different complete runtime context.
    #[error("local-log-checkpoint V2 codec context differs from its retained session context")]
    ContextConfigurationMismatch,
    /// The input exceeds the configured UTF-8 byte limit.
    #[error("local-log-checkpoint V2 JSON is {actual} bytes; the configured maximum is {maximum}")]
    InputTooLarge {
        /// Actual input size.
        actual: usize,
        /// Maximum accepted input size.
        maximum: usize,
    },
    /// A deterministic encoding exceeds the codec's decoding budget.
    #[error(
        "encoded local-log-checkpoint V2 JSON exceeds the configured maximum {maximum}; at least {minimum} bytes were observed"
    )]
    OutputTooLarge {
        /// Lower bound observed before serialization stopped, saturated at `usize::MAX`.
        minimum: usize,
        /// Maximum accepted input size for the same codec.
        maximum: usize,
    },
    /// The outer JSON syntax or strict V2 record shape is invalid.
    #[error("invalid local-log-checkpoint V2 JSON: {0}")]
    InvalidJson(#[source] JsonFailure),
    /// The envelope does not identify Breditor's local-log-checkpoint format.
    #[error("unsupported local-log-checkpoint format `{found}`; expected `{expected}`")]
    UnsupportedFormat {
        /// Format found in the input.
        found: BoundedDiagnostic,
        /// Format accepted by this codec.
        expected: &'static str,
    },
    /// The envelope uses a wire version other than Local Log Checkpoint V2.
    #[error(
        "unsupported local-log-checkpoint format version {found}; this codec supports {supported}"
    )]
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
    /// The parsed durable binding does not match the codec's compiled schema.
    #[error(transparent)]
    SchemaBinding(#[from] SchemaBindingError),
    /// An identity, frontier, tombstone, trusted-log binding, or anchor invariant failed.
    #[error("invalid local-log-checkpoint V2 payload: {0}")]
    InvalidCheckpoint(#[source] Box<LocalLogCheckpointCodecError>),
    /// The embedded complete Session Checkpoint V2 failed its codec boundary.
    #[error("invalid nested Session Checkpoint V2: {0}")]
    InvalidSessionCheckpoint(#[source] Box<SessionCheckpointV2CodecError>),
    /// Serialization of a checked V2 checkpoint failed.
    #[error("could not encode local-log-checkpoint V2 JSON: {0}")]
    Encoding(#[source] JsonFailure),
}

impl LocalLogCheckpointV2CodecError {
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
            Self::InvalidCheckpoint(source) => source.code(),
            Self::InvalidSessionCheckpoint(source) => source.code(),
            Self::Encoding(_) => CodecErrorCode::EncodingFailed,
        }
    }
}

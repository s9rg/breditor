//! Typed failures for property-preserving operation envelopes.

use thiserror::Error;

use crate::{
    identity::QualifiedNameError,
    operation::OperationValidationError,
    schema::{SchemaBindingError, SchemaFingerprintParseError, SchemaVersionError},
};

use super::{BoundedDiagnostic, CodecErrorCode, JsonFailure, OperationRecordError};

/// A typed failure while decoding or encoding one V3 operation envelope.
#[derive(Debug, Error)]
#[non_exhaustive]
pub enum OperationV3CodecError {
    /// The input exceeds the configured UTF-8 byte limit.
    #[error("operation V3 JSON is {actual} bytes; the configured maximum is {maximum}")]
    InputTooLarge {
        /// Actual input size.
        actual: usize,
        /// Maximum accepted input size.
        maximum: usize,
    },
    /// A deterministic encoding would exceed the codec's decoding budget.
    #[error(
        "encoded operation V3 JSON exceeds the configured maximum {maximum}; at least {minimum} bytes were observed"
    )]
    OutputTooLarge {
        /// Lower bound observed before serialization stopped, saturated at `usize::MAX`.
        minimum: usize,
        /// Maximum accepted input size for the same codec.
        maximum: usize,
    },
    /// The JSON syntax or strict V3 record shape is invalid.
    #[error("invalid operation V3 JSON: {0}")]
    InvalidJson(#[source] JsonFailure),
    /// The envelope does not identify Breditor's operation format.
    #[error("unsupported operation format `{found}`; expected `{expected}`")]
    UnsupportedFormat {
        /// Format found in the input.
        found: BoundedDiagnostic,
        /// Format accepted by this codec.
        expected: &'static str,
    },
    /// The envelope does not use the V3 operation wire version.
    #[error("unsupported operation format version {found}; this codec supports {supported}")]
    UnsupportedFormatVersion {
        /// Version found in the input.
        found: u32,
        /// Version accepted by this codec.
        supported: u32,
    },
    /// The encoded schema name is malformed.
    #[error("invalid encoded schema name `{value}`: {source}")]
    InvalidSchemaName {
        /// Encoded schema name.
        value: BoundedDiagnostic,
        /// Qualified-name validation failure.
        #[source]
        source: QualifiedNameError,
    },
    /// The encoded schema version is reserved or invalid.
    #[error("invalid encoded schema version {value}: {source}")]
    InvalidSchemaVersion {
        /// Encoded schema version.
        value: u32,
        /// Version validation failure.
        #[source]
        source: SchemaVersionError,
    },
    /// The encoded fingerprint violates the canonical lowercase SHA-256 text contract.
    #[error("invalid encoded schema fingerprint: {0}")]
    InvalidSchemaFingerprint(#[from] SchemaFingerprintParseError),
    /// The parsed durable binding does not match this codec's compiled schema.
    #[error(transparent)]
    SchemaBinding(#[from] SchemaBindingError),
    /// The strict primitive operation record could not pass checked constructors.
    #[error(transparent)]
    InvalidOperation(#[from] OperationRecordError),
    /// The reconstructed or supplied operation violates the active context.
    #[error(transparent)]
    Validation(#[from] OperationValidationError),
    /// Serialization of a checked runtime operation failed.
    #[error("could not encode operation V3 JSON: {0}")]
    Encoding(#[source] JsonFailure),
}

impl OperationV3CodecError {
    /// Returns the stable machine-readable failure category.
    #[must_use]
    pub const fn code(&self) -> CodecErrorCode {
        match self {
            Self::InputTooLarge { .. } => CodecErrorCode::InputTooLarge,
            Self::OutputTooLarge { .. } => CodecErrorCode::OutputTooLarge,
            Self::InvalidJson(_) => CodecErrorCode::InvalidJson,
            Self::UnsupportedFormat { .. } => CodecErrorCode::UnsupportedFormat,
            Self::UnsupportedFormatVersion { .. } => CodecErrorCode::UnsupportedFormatVersion,
            Self::InvalidSchemaName { .. } => CodecErrorCode::InvalidSchemaName,
            Self::InvalidSchemaVersion { .. } => CodecErrorCode::InvalidSchemaVersion,
            Self::InvalidSchemaFingerprint(_) => CodecErrorCode::InvalidSchemaFingerprint,
            Self::SchemaBinding(_) => CodecErrorCode::SchemaMismatch,
            Self::InvalidOperation(_) => CodecErrorCode::InvalidOperation,
            Self::Validation(_) => CodecErrorCode::ValidationFailed,
            Self::Encoding(_) => CodecErrorCode::EncodingFailed,
        }
    }
}

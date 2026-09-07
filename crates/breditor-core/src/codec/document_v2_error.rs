use thiserror::Error;

use crate::{
    identity::QualifiedNameError,
    schema::{
        SchemaBindingError, SchemaFingerprintParseError, SchemaVersionError, ValidationReport,
    },
};

use super::{BoundedDiagnostic, CodecErrorCode, JsonFailure};

/// A typed failure while decoding or encoding a Document V2 value.
#[derive(Debug, Error)]
#[non_exhaustive]
pub enum DocumentV2CodecError {
    /// The input exceeds the configured UTF-8 byte limit.
    #[error("document V2 JSON is {actual} bytes; the configured maximum is {maximum}")]
    InputTooLarge {
        /// Actual input size.
        actual: usize,
        /// Maximum accepted input size.
        maximum: usize,
    },
    /// A deterministic encoding would exceed the codec's decoding budget.
    #[error(
        "encoded document V2 JSON exceeds the configured maximum {maximum}; at least {minimum} bytes were observed"
    )]
    OutputTooLarge {
        /// Lower bound observed before serialization stopped, saturated at `usize::MAX`.
        minimum: usize,
        /// Maximum accepted input size for the same codec.
        maximum: usize,
    },
    /// The JSON syntax or strict V2 record shape is invalid.
    #[error("invalid document V2 JSON: {0}")]
    InvalidJson(#[source] JsonFailure),
    /// The envelope does not identify Breditor's document format.
    #[error("unsupported document format `{found}`; expected `{expected}`")]
    UnsupportedFormat {
        /// Format found in the input.
        found: BoundedDiagnostic,
        /// Format accepted by this codec.
        expected: &'static str,
    },
    /// The envelope uses a wire version other than Document V2.
    #[error("unsupported document format version {found}; this codec supports {supported}")]
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
    /// The encoded fingerprint text is not canonical.
    #[error("invalid encoded schema fingerprint: {0}")]
    InvalidSchemaFingerprint(#[from] SchemaFingerprintParseError),
    /// The parsed durable binding does not match the codec's compiled schema.
    #[error(transparent)]
    SchemaBinding(#[from] SchemaBindingError),
    /// Complete document validation failed.
    #[error(transparent)]
    Validation(#[from] ValidationReport),
    /// Serialization of an invariant-bearing runtime document failed.
    #[error("could not encode validated document V2 JSON: {0}")]
    Encoding(#[source] JsonFailure),
}

impl DocumentV2CodecError {
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
            Self::Validation(_) => CodecErrorCode::ValidationFailed,
            Self::Encoding(_) => CodecErrorCode::EncodingFailed,
        }
    }
}

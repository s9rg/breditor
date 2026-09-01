use std::{error::Error, fmt, sync::Arc};

use thiserror::Error;

use crate::{
    identity::{QualifiedName, QualifiedNameError},
    schema::{SchemaId, SchemaVersionError, ValidationReport},
};

/// Broad category of a JSON parser or serializer failure.
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub enum JsonFailureKind {
    /// An underlying reader or writer failed.
    Io,
    /// JSON syntax is malformed.
    Syntax,
    /// JSON is syntactically valid but violates the strict record shape.
    Data,
    /// Input ended before a complete JSON value was read.
    EndOfInput,
}

/// Breditor-owned details about a JSON failure.
///
/// The text is diagnostic only. Engine behavior should use [`Self::kind`] and
/// the enclosing [`CodecErrorCode`].
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct JsonFailure {
    kind: JsonFailureKind,
    line: usize,
    column: usize,
    message: Arc<str>,
}

impl JsonFailure {
    /// Returns the broad failure category.
    #[must_use]
    pub const fn kind(&self) -> JsonFailureKind {
        self.kind
    }

    /// Returns the one-based line reported by the JSON implementation.
    #[must_use]
    pub const fn line(&self) -> usize {
        self.line
    }

    /// Returns the one-based column reported by the JSON implementation.
    #[must_use]
    pub const fn column(&self) -> usize {
        self.column
    }

    /// Returns the implementation-specific human diagnostic.
    #[must_use]
    pub fn message(&self) -> &str {
        &self.message
    }

    pub(crate) fn from_serde(error: &serde_json::Error) -> Self {
        let kind = match error.classify() {
            serde_json::error::Category::Io => JsonFailureKind::Io,
            serde_json::error::Category::Syntax => JsonFailureKind::Syntax,
            serde_json::error::Category::Data => JsonFailureKind::Data,
            serde_json::error::Category::Eof => JsonFailureKind::EndOfInput,
        };
        Self {
            kind,
            line: error.line(),
            column: error.column(),
            message: Arc::from(error.to_string()),
        }
    }
}

impl fmt::Display for JsonFailure {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.message)
    }
}

impl Error for JsonFailure {}

/// Stable category for a [`DocumentCodecError`].
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub enum CodecErrorCode {
    /// The input exceeds the configured byte limit.
    InputTooLarge,
    /// The input is not strict JSON for the selected record version.
    InvalidJson,
    /// The document format identifier is unsupported.
    UnsupportedFormat,
    /// The document wire version is unsupported.
    UnsupportedFormatVersion,
    /// The schema name does not satisfy the qualified-name grammar.
    InvalidSchemaName,
    /// The schema version is zero.
    InvalidSchemaVersion,
    /// The record targets a different compiled schema.
    SchemaMismatch,
    /// The record violates schema, canonicality, or resource limits.
    ValidationFailed,
    /// A validated runtime document could not be serialized.
    EncodingFailed,
}

impl CodecErrorCode {
    /// Returns the stable code used across language boundaries.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::InputTooLarge => "codec.input_too_large",
            Self::InvalidJson => "codec.invalid_json",
            Self::UnsupportedFormat => "codec.unsupported_format",
            Self::UnsupportedFormatVersion => "codec.unsupported_format_version",
            Self::InvalidSchemaName => "codec.invalid_schema_name",
            Self::InvalidSchemaVersion => "codec.invalid_schema_version",
            Self::SchemaMismatch => "codec.schema_mismatch",
            Self::ValidationFailed => "codec.validation_failed",
            Self::EncodingFailed => "codec.encoding_failed",
        }
    }
}

/// A typed failure while decoding or encoding a versioned document.
#[derive(Debug, Error)]
pub enum DocumentCodecError {
    /// The input exceeds the configured UTF-8 byte limit.
    #[error("document JSON is {actual} bytes; the configured maximum is {maximum}")]
    InputTooLarge {
        /// Actual input size.
        actual: usize,
        /// Maximum accepted input size.
        maximum: usize,
    },
    /// The JSON syntax or strict record shape is invalid.
    #[error("invalid document JSON: {0}")]
    InvalidJson(#[source] JsonFailure),
    /// The envelope does not identify Breditor's document format.
    #[error("unsupported document format `{found}`; expected `{expected}`")]
    UnsupportedFormat {
        /// Format found in the input.
        found: String,
        /// Format accepted by this codec.
        expected: &'static str,
    },
    /// The envelope uses an unsupported wire version.
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
        value: String,
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
    /// The input targets a different schema than this codec.
    #[error("schema mismatch: input targets `{found}`, codec expects `{expected}`")]
    SchemaMismatch {
        /// Schema expected by the codec.
        expected: SchemaId,
        /// Schema encoded by the document.
        found: SchemaId,
    },
    /// Complete document validation failed.
    #[error(transparent)]
    Validation(#[from] ValidationReport),
    /// Serialization of an invariant-bearing runtime document failed.
    #[error("could not encode validated document JSON: {0}")]
    Encoding(#[source] JsonFailure),
}

impl DocumentCodecError {
    /// Returns the stable machine-readable failure category.
    #[must_use]
    pub const fn code(&self) -> CodecErrorCode {
        match self {
            Self::InputTooLarge { .. } => CodecErrorCode::InputTooLarge,
            Self::InvalidJson(_) => CodecErrorCode::InvalidJson,
            Self::UnsupportedFormat { .. } => CodecErrorCode::UnsupportedFormat,
            Self::UnsupportedFormatVersion { .. } => CodecErrorCode::UnsupportedFormatVersion,
            Self::InvalidSchemaName { .. } => CodecErrorCode::InvalidSchemaName,
            Self::InvalidSchemaVersion { .. } => CodecErrorCode::InvalidSchemaVersion,
            Self::SchemaMismatch { .. } => CodecErrorCode::SchemaMismatch,
            Self::Validation(_) => CodecErrorCode::ValidationFailed,
            Self::Encoding(_) => CodecErrorCode::EncodingFailed,
        }
    }
}

pub(crate) fn schema_name_from_record(value: String) -> Result<QualifiedName, DocumentCodecError> {
    QualifiedName::try_from(value.clone())
        .map_err(|source| DocumentCodecError::InvalidSchemaName { value, source })
}

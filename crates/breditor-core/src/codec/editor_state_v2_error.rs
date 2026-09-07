use thiserror::Error;

use crate::{
    identity::QualifiedNameError,
    schema::{SchemaBindingError, SchemaFingerprintParseError, SchemaVersionError},
    state::EditorStateError,
};

use super::{
    BoundedDiagnostic, CodecErrorCode, DocumentV2CodecError, EditorStateRecordError, JsonFailure,
};

/// A typed failure while decoding or encoding one Editor State V2 checkpoint.
#[derive(Debug, Error)]
#[non_exhaustive]
pub enum EditorStateV2CodecError {
    /// The supplied state was proved under a different complete runtime context.
    #[error("editor-state V2 codec context differs from the supplied state context")]
    ContextConfigurationMismatch,
    /// The input exceeds the configured UTF-8 byte limit.
    #[error("editor-state V2 JSON is {actual} bytes; the configured maximum is {maximum}")]
    InputTooLarge {
        /// Actual input size.
        actual: usize,
        /// Maximum accepted input size.
        maximum: usize,
    },
    /// A deterministic encoding would exceed the codec's decoding budget.
    #[error(
        "encoded editor-state V2 JSON exceeds the configured maximum {maximum}; at least {minimum} bytes were observed"
    )]
    OutputTooLarge {
        /// Lower bound observed before serialization stopped, saturated at `usize::MAX`.
        minimum: usize,
        /// Maximum accepted input size for the same codec.
        maximum: usize,
    },
    /// The outer JSON syntax or strict V2 record shape is invalid.
    #[error("invalid editor-state V2 JSON: {0}")]
    InvalidJson(#[source] JsonFailure),
    /// The envelope does not identify Breditor's editor-state format.
    #[error("unsupported editor-state format `{found}`; expected `{expected}`")]
    UnsupportedFormat {
        /// Format found in the input.
        found: BoundedDiagnostic,
        /// Format accepted by this codec.
        expected: &'static str,
    },
    /// The envelope uses a wire version other than Editor State V2.
    #[error("unsupported editor-state format version {found}; this codec supports {supported}")]
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
    /// The embedded Document V2 value failed its authoritative codec boundary.
    #[error("invalid editor-state V2 document: {0}")]
    InvalidDocument(#[source] DocumentV2CodecError),
    /// A non-document field could not pass checked reconstruction.
    #[error(transparent)]
    InvalidEditorState(#[from] EditorStateRecordError),
    /// The reconstructed fields do not form one valid complete editor state.
    #[error(transparent)]
    Validation(#[from] EditorStateError),
    /// Serialization of a checked editor state failed.
    #[error("could not encode editor-state V2 JSON: {0}")]
    Encoding(#[source] JsonFailure),
}

impl EditorStateV2CodecError {
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
            Self::InvalidDocument(source) => source.code(),
            Self::InvalidEditorState(_) => CodecErrorCode::InvalidEditorState,
            Self::Validation(_) => CodecErrorCode::ValidationFailed,
            Self::Encoding(_) => CodecErrorCode::EncodingFailed,
        }
    }
}

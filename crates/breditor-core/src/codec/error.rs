use std::{error::Error, fmt};

use thiserror::Error;

use crate::{
    identity::QualifiedNameError,
    schema::{SchemaId, SchemaVersionError, ValidationReport},
};

use super::BoundedDiagnostic;

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
    message: BoundedDiagnostic,
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

    /// Returns the bounded implementation-specific human diagnostic preview.
    ///
    /// Use [`Self::diagnostic`] when the original byte length or truncation
    /// state matters.
    #[must_use]
    pub fn message(&self) -> &str {
        self.message.preview()
    }

    /// Returns the bounded diagnostic value and its truncation metadata.
    #[must_use]
    pub const fn diagnostic(&self) -> &BoundedDiagnostic {
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
            message: BoundedDiagnostic::from(error.to_string()),
        }
    }
}

impl fmt::Display for JsonFailure {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Display::fmt(&self.message, formatter)
    }
}

impl Error for JsonFailure {}

/// Stable category for a versioned codec failure.
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[non_exhaustive]
pub enum CodecErrorCode {
    /// The input exceeds the configured byte limit.
    InputTooLarge,
    /// A deterministic encoding exceeds the configured byte limit.
    OutputTooLarge,
    /// The input is not strict JSON for the selected record version.
    InvalidJson,
    /// The envelope format identifier is unsupported.
    UnsupportedFormat,
    /// The envelope wire version is unsupported.
    UnsupportedFormatVersion,
    /// The schema name does not satisfy the qualified-name grammar.
    InvalidSchemaName,
    /// The schema version is zero.
    InvalidSchemaVersion,
    /// The record targets a different compiled schema.
    SchemaMismatch,
    /// The caller supplied a runtime context incompatible with the codec.
    ContextMismatch,
    /// A request targets a different immutable snapshot.
    SnapshotMismatch,
    /// A record exceeds a semantic resource ceiling.
    ResourceLimit,
    /// The decoded or supplied runtime value violates complete document
    /// validation or context-static operation limits.
    ValidationFailed,
    /// A wire operation could not be reconstructed through checked contracts.
    InvalidOperation,
    /// A transaction field could not be reconstructed through checked contracts.
    InvalidTransaction,
    /// A durable commit could not be reconstructed through checked contracts.
    InvalidCommit,
    /// A durable session checkpoint failed topology or replay proof.
    InvalidSessionCheckpoint,
    /// An editor-state field could not be reconstructed through checked contracts.
    InvalidEditorState,
    /// A validated runtime value could not be serialized.
    EncodingFailed,
}

impl CodecErrorCode {
    /// Returns the stable code used across language boundaries.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::InputTooLarge => "codec.input_too_large",
            Self::OutputTooLarge => "codec.output_too_large",
            Self::InvalidJson => "codec.invalid_json",
            Self::UnsupportedFormat => "codec.unsupported_format",
            Self::UnsupportedFormatVersion => "codec.unsupported_format_version",
            Self::InvalidSchemaName => "codec.invalid_schema_name",
            Self::InvalidSchemaVersion => "codec.invalid_schema_version",
            Self::SchemaMismatch => "codec.schema_mismatch",
            Self::ContextMismatch => "codec.context_mismatch",
            Self::SnapshotMismatch => "codec.snapshot_mismatch",
            Self::ResourceLimit => "codec.resource_limit",
            Self::ValidationFailed => "codec.validation_failed",
            Self::InvalidOperation => "codec.invalid_operation",
            Self::InvalidTransaction => "codec.invalid_transaction",
            Self::InvalidCommit => "codec.invalid_commit",
            Self::InvalidSessionCheckpoint => "codec.invalid_session_checkpoint",
            Self::InvalidEditorState => "codec.invalid_editor_state",
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
    /// A deterministic encoding would exceed the codec's decoding budget.
    #[error(
        "encoded document JSON exceeds the configured maximum {maximum}; at least {minimum} bytes were observed"
    )]
    OutputTooLarge {
        /// Lower bound observed before serialization stopped, saturated at `usize::MAX`.
        minimum: usize,
        /// Maximum accepted input size for the same codec.
        maximum: usize,
    },
    /// The JSON syntax or strict record shape is invalid.
    #[error("invalid document JSON: {0}")]
    InvalidJson(#[source] JsonFailure),
    /// The envelope does not identify Breditor's document format.
    #[error("unsupported document format `{found}`; expected `{expected}`")]
    UnsupportedFormat {
        /// Format found in the input.
        found: BoundedDiagnostic,
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
            Self::OutputTooLarge { .. } => CodecErrorCode::OutputTooLarge,
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

#[cfg(test)]
mod tests {
    use std::{error::Error, io};

    use serde::Deserialize;

    use crate::codec::MAX_DIAGNOSTIC_PREVIEW_BYTES;

    use super::{CodecErrorCode, JsonFailure};

    #[derive(Debug, Deserialize)]
    #[serde(deny_unknown_fields)]
    struct EmptyRecord {}

    #[test]
    fn codec_error_code_strings_are_stable() {
        let cases = [
            (CodecErrorCode::InputTooLarge, "codec.input_too_large"),
            (CodecErrorCode::OutputTooLarge, "codec.output_too_large"),
            (CodecErrorCode::InvalidJson, "codec.invalid_json"),
            (CodecErrorCode::UnsupportedFormat, "codec.unsupported_format"),
            (CodecErrorCode::UnsupportedFormatVersion, "codec.unsupported_format_version"),
            (CodecErrorCode::InvalidSchemaName, "codec.invalid_schema_name"),
            (CodecErrorCode::InvalidSchemaVersion, "codec.invalid_schema_version"),
            (CodecErrorCode::SchemaMismatch, "codec.schema_mismatch"),
            (CodecErrorCode::ContextMismatch, "codec.context_mismatch"),
            (CodecErrorCode::SnapshotMismatch, "codec.snapshot_mismatch"),
            (CodecErrorCode::ResourceLimit, "codec.resource_limit"),
            (CodecErrorCode::ValidationFailed, "codec.validation_failed"),
            (CodecErrorCode::InvalidOperation, "codec.invalid_operation"),
            (CodecErrorCode::InvalidTransaction, "codec.invalid_transaction"),
            (CodecErrorCode::InvalidCommit, "codec.invalid_commit"),
            (CodecErrorCode::InvalidSessionCheckpoint, "codec.invalid_session_checkpoint"),
            (CodecErrorCode::InvalidEditorState, "codec.invalid_editor_state"),
            (CodecErrorCode::EncodingFailed, "codec.encoding_failed"),
        ];

        for (code, expected) in cases {
            assert_eq!(code.as_str(), expected);
        }
    }

    #[test]
    fn serde_failure_retains_only_a_bounded_message_preview() -> Result<(), Box<dyn Error>> {
        let hostile_key = "x".repeat(MAX_DIAGNOSTIC_PREVIEW_BYTES * 4);
        let json = format!(r#"{{"{hostile_key}":true}}"#);
        let Err(error) = serde_json::from_str::<EmptyRecord>(&json) else {
            return Err(io::Error::other("unknown key unexpectedly decoded").into());
        };
        let failure = JsonFailure::from_serde(&error);

        assert!(failure.diagnostic().is_truncated());
        assert!(failure.message().len() <= MAX_DIAGNOSTIC_PREVIEW_BYTES);
        assert_eq!(failure.diagnostic().original_byte_len(), error.to_string().len());
        Ok(())
    }
}

//! Typed failures for property-preserving editor-state checkpoints.

use std::{error::Error, fmt};

use thiserror::Error;

use crate::{
    identity::QualifiedNameError,
    schema::{SchemaBindingError, SchemaFingerprintParseError, SchemaVersionError},
    state::EditorStateError,
};

use super::{
    BoundedDiagnostic, CodecErrorCode, DocumentV2CodecError, EditorStateRecordError, JsonFailure,
    editor_value_payload_v2::{EditorValueRecordV2Error, EditorValueRecordV2ErrorCode},
};

/// Stable category for a property-preserving pending-format failure.
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[non_exhaustive]
pub enum EditorStateV3PendingFormatErrorCode {
    /// A format type does not satisfy the qualified-name grammar.
    InvalidFormatName,
    /// A top-level property key does not satisfy the qualified-name grammar.
    InvalidPropertyName,
    /// A property value cannot enter the deterministic runtime value model.
    InvalidPropertyValue,
    /// A format instance violates its compiled schema contract.
    InvalidFormatInstance,
    /// The pending-format array exceeds the active context limit.
    PendingFormatLimit,
    /// Pending formats are not sorted and unique by kind.
    NonCanonicalPendingFormats,
    /// Fixed-width aggregate property-value accounting overflowed.
    PropertyValueCountOverflow,
    /// Pending formats exceed the aggregate property-value ceiling.
    PropertyValueCountLimit,
    /// Fixed-width aggregate property-string accounting overflowed.
    PropertyStringBytesOverflow,
    /// Pending formats exceed the aggregate property-string byte ceiling.
    PropertyStringBytesLimit,
}

impl EditorStateV3PendingFormatErrorCode {
    /// Returns the stable category string used across language boundaries.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::InvalidFormatName => "editor_state_v3.pending_formats.invalid_format_name",
            Self::InvalidPropertyName => "editor_state_v3.pending_formats.invalid_property_name",
            Self::InvalidPropertyValue => "editor_state_v3.pending_formats.invalid_property_value",
            Self::InvalidFormatInstance => {
                "editor_state_v3.pending_formats.invalid_format_instance"
            }
            Self::PendingFormatLimit => "editor_state_v3.pending_formats.format_limit",
            Self::NonCanonicalPendingFormats => {
                "editor_state_v3.pending_formats.noncanonical_formats"
            }
            Self::PropertyValueCountOverflow => {
                "editor_state_v3.pending_formats.property_value_count_overflow"
            }
            Self::PropertyValueCountLimit => {
                "editor_state_v3.pending_formats.property_value_count_limit"
            }
            Self::PropertyStringBytesOverflow => {
                "editor_state_v3.pending_formats.property_string_bytes_overflow"
            }
            Self::PropertyStringBytesLimit => {
                "editor_state_v3.pending_formats.property_string_bytes_limit"
            }
        }
    }
}

/// Bounded, redacted details for one invalid V3 pending-format field.
///
/// The optional index is stable control-flow data. The diagnostic never owns
/// an untrusted property name or scalar value.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EditorStateV3PendingFormatError {
    code: EditorStateV3PendingFormatErrorCode,
    format_index: Option<u64>,
    diagnostic: BoundedDiagnostic,
}

impl EditorStateV3PendingFormatError {
    /// Returns the stable failure category.
    #[must_use]
    pub const fn code(&self) -> EditorStateV3PendingFormatErrorCode {
        self.code
    }

    /// Returns the zero-based pending-format index when one entry owns the failure.
    #[must_use]
    pub const fn format_index(&self) -> Option<u64> {
        self.format_index
    }

    /// Returns the bounded human-readable diagnostic preview.
    #[must_use]
    pub fn diagnostic(&self) -> &str {
        self.diagnostic.preview()
    }

    /// Returns the diagnostic together with its original-size metadata.
    #[must_use]
    pub const fn diagnostic_value(&self) -> &BoundedDiagnostic {
        &self.diagnostic
    }

    pub(crate) fn from_editor_value(error: &EditorValueRecordV2Error) -> Self {
        let code = match error.code() {
            EditorValueRecordV2ErrorCode::InvalidFormatName => {
                EditorStateV3PendingFormatErrorCode::InvalidFormatName
            }
            EditorValueRecordV2ErrorCode::InvalidPropertyName => {
                EditorStateV3PendingFormatErrorCode::InvalidPropertyName
            }
            EditorValueRecordV2ErrorCode::InvalidPropertyValue => {
                EditorStateV3PendingFormatErrorCode::InvalidPropertyValue
            }
            EditorValueRecordV2ErrorCode::InvalidFormatInstance => {
                EditorStateV3PendingFormatErrorCode::InvalidFormatInstance
            }
            EditorValueRecordV2ErrorCode::PendingFormatLimit => {
                EditorStateV3PendingFormatErrorCode::PendingFormatLimit
            }
            EditorValueRecordV2ErrorCode::NonCanonicalPendingFormats => {
                EditorStateV3PendingFormatErrorCode::NonCanonicalPendingFormats
            }
            EditorValueRecordV2ErrorCode::PropertyValueCountOverflow => {
                EditorStateV3PendingFormatErrorCode::PropertyValueCountOverflow
            }
            EditorValueRecordV2ErrorCode::PropertyValueCountLimit => {
                EditorStateV3PendingFormatErrorCode::PropertyValueCountLimit
            }
            EditorValueRecordV2ErrorCode::PropertyStringBytesOverflow => {
                EditorStateV3PendingFormatErrorCode::PropertyStringBytesOverflow
            }
            EditorValueRecordV2ErrorCode::PropertyStringBytesLimit => {
                EditorStateV3PendingFormatErrorCode::PropertyStringBytesLimit
            }
        };
        Self {
            code,
            format_index: error.format_index(),
            diagnostic: error.diagnostic_value().clone(),
        }
    }
}

impl fmt::Display for EditorStateV3PendingFormatError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(formatter, "{}", self.code.as_str())?;
        if let Some(format_index) = self.format_index {
            write!(formatter, " at pending format {format_index}")?;
        }
        write!(formatter, ": {}", self.diagnostic)
    }
}

impl Error for EditorStateV3PendingFormatError {}

/// A typed failure while decoding or encoding one Editor State V3 checkpoint.
#[derive(Debug, Error)]
#[non_exhaustive]
pub enum EditorStateV3CodecError {
    /// The supplied state was proved under a different complete runtime context.
    #[error("editor-state V3 codec context differs from the supplied state context")]
    ContextConfigurationMismatch,
    /// The input exceeds the configured UTF-8 byte limit.
    #[error("editor-state V3 JSON is {actual} bytes; the configured maximum is {maximum}")]
    InputTooLarge {
        /// Actual input size.
        actual: usize,
        /// Maximum accepted input size.
        maximum: usize,
    },
    /// A deterministic encoding would exceed the codec's decoding budget.
    #[error(
        "encoded editor-state V3 JSON exceeds the configured maximum {maximum}; at least {minimum} bytes were observed"
    )]
    OutputTooLarge {
        /// Lower bound observed before serialization stopped, saturated at `usize::MAX`.
        minimum: usize,
        /// Maximum accepted input size for the same codec.
        maximum: usize,
    },
    /// The outer JSON syntax or strict V3 record shape is invalid.
    #[error("invalid editor-state V3 JSON: {0}")]
    InvalidJson(#[source] JsonFailure),
    /// The envelope does not identify Breditor's editor-state format.
    #[error("unsupported editor-state format `{found}`; expected `{expected}`")]
    UnsupportedFormat {
        /// Format found in the input.
        found: BoundedDiagnostic,
        /// Format accepted by this codec.
        expected: &'static str,
    },
    /// The envelope uses a wire version other than Editor State V3.
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
    #[error("invalid editor-state V3 document: {0}")]
    InvalidDocument(#[source] DocumentV2CodecError),
    /// Snapshot or selection reconstruction failed.
    #[error(transparent)]
    InvalidEditorState(#[from] EditorStateRecordError),
    /// Property-preserving pending-format reconstruction failed.
    #[error("invalid editor-state V3 pending formats: {0}")]
    InvalidPendingFormats(#[source] EditorStateV3PendingFormatError),
    /// The reconstructed fields do not form one valid complete editor state.
    #[error(transparent)]
    Validation(#[from] EditorStateError),
    /// Serialization of a checked editor state failed.
    #[error("could not encode editor-state V3 JSON: {0}")]
    Encoding(#[source] JsonFailure),
}

impl EditorStateV3CodecError {
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
            Self::InvalidEditorState(_) | Self::InvalidPendingFormats(_) => {
                CodecErrorCode::InvalidEditorState
            }
            Self::Validation(_) => CodecErrorCode::ValidationFailed,
            Self::Encoding(_) => CodecErrorCode::EncodingFailed,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::EditorStateV3PendingFormatErrorCode;

    #[test]
    fn pending_format_error_code_strings_are_stable() {
        let cases = [
            (
                EditorStateV3PendingFormatErrorCode::InvalidFormatName,
                "editor_state_v3.pending_formats.invalid_format_name",
            ),
            (
                EditorStateV3PendingFormatErrorCode::InvalidPropertyName,
                "editor_state_v3.pending_formats.invalid_property_name",
            ),
            (
                EditorStateV3PendingFormatErrorCode::InvalidPropertyValue,
                "editor_state_v3.pending_formats.invalid_property_value",
            ),
            (
                EditorStateV3PendingFormatErrorCode::InvalidFormatInstance,
                "editor_state_v3.pending_formats.invalid_format_instance",
            ),
            (
                EditorStateV3PendingFormatErrorCode::PendingFormatLimit,
                "editor_state_v3.pending_formats.format_limit",
            ),
            (
                EditorStateV3PendingFormatErrorCode::NonCanonicalPendingFormats,
                "editor_state_v3.pending_formats.noncanonical_formats",
            ),
            (
                EditorStateV3PendingFormatErrorCode::PropertyValueCountOverflow,
                "editor_state_v3.pending_formats.property_value_count_overflow",
            ),
            (
                EditorStateV3PendingFormatErrorCode::PropertyValueCountLimit,
                "editor_state_v3.pending_formats.property_value_count_limit",
            ),
            (
                EditorStateV3PendingFormatErrorCode::PropertyStringBytesOverflow,
                "editor_state_v3.pending_formats.property_string_bytes_overflow",
            ),
            (
                EditorStateV3PendingFormatErrorCode::PropertyStringBytesLimit,
                "editor_state_v3.pending_formats.property_string_bytes_limit",
            ),
        ];

        for (code, expected) in cases {
            assert_eq!(code.as_str(), expected);
        }
    }
}

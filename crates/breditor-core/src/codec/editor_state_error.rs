use std::{error::Error, fmt};

use thiserror::Error;

use crate::state::EditorStateError;

use super::{BoundedDiagnostic, CodecErrorCode, DocumentCodecError, JsonFailure};

/// Stable category for a checked editor-state V1 reconstruction failure.
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[non_exhaustive]
pub enum EditorStateRecordErrorCode {
    /// The snapshot lineage violates the portable identity grammar.
    InvalidSnapshotLineage,
    /// The snapshot revision is not a canonical decimal `u64` string.
    InvalidSnapshotRevision,
    /// A selection point path exceeds the fixed protocol depth.
    InvalidSelectionPath,
    /// A pending-format name is not a qualified name.
    InvalidQualifiedName,
    /// The pending-format array exceeds the active context limit.
    PendingFormatLimit,
    /// Pending formats are not sorted and unique by kind.
    NonCanonicalPendingFormats,
    /// A pending format is not representable in V1 or allowed by the active schema.
    PendingFormatNotAllowed,
}

impl EditorStateRecordErrorCode {
    /// Returns the stable code used across language boundaries.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::InvalidSnapshotLineage => "editor_state_record.invalid_snapshot_lineage",
            Self::InvalidSnapshotRevision => "editor_state_record.invalid_snapshot_revision",
            Self::InvalidSelectionPath => "editor_state_record.invalid_selection_path",
            Self::InvalidQualifiedName => "editor_state_record.invalid_qualified_name",
            Self::PendingFormatLimit => "editor_state_record.pending_format_limit",
            Self::NonCanonicalPendingFormats => "editor_state_record.noncanonical_pending_formats",
            Self::PendingFormatNotAllowed => "editor_state_record.pending_format_not_allowed",
        }
    }
}

/// Stable location within an editor-state V1 record.
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[non_exhaustive]
pub enum EditorStateRecordLocation {
    /// `snapshot.lineage`.
    SnapshotLineage,
    /// `snapshot.revision`.
    SnapshotRevision,
    /// The selection's anchor point.
    SelectionAnchor,
    /// The selection's focus point.
    SelectionFocus,
    /// The complete `pendingFormats` array.
    PendingFormats,
    /// One entry in `pendingFormats`.
    PendingFormat {
        /// Zero-based format index.
        format_index: u64,
    },
}

/// Breditor-owned details for one invalid editor-state V1 field.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EditorStateRecordError {
    code: EditorStateRecordErrorCode,
    location: EditorStateRecordLocation,
    diagnostic: BoundedDiagnostic,
}

impl EditorStateRecordError {
    /// Returns the stable reconstruction failure category.
    #[must_use]
    pub const fn code(&self) -> EditorStateRecordErrorCode {
        self.code
    }

    /// Returns the stable rejected-field location.
    #[must_use]
    pub const fn location(&self) -> EditorStateRecordLocation {
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
        code: EditorStateRecordErrorCode,
        location: EditorStateRecordLocation,
        diagnostic: impl Into<BoundedDiagnostic>,
    ) -> Self {
        Self { code, location, diagnostic: diagnostic.into() }
    }
}

impl fmt::Display for EditorStateRecordError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(formatter, "invalid editor-state record at {:?}: {}", self.location, self.diagnostic)
    }
}

impl Error for EditorStateRecordError {}

/// A typed failure while decoding or encoding one editor-state checkpoint.
#[derive(Debug, Error)]
#[non_exhaustive]
pub enum EditorStateCodecError {
    /// The supplied state was proved under a different runtime context.
    #[error("editor-state codec context differs from the supplied state context")]
    ContextConfigurationMismatch,
    /// The input exceeds the configured UTF-8 byte limit.
    #[error("editor-state JSON is {actual} bytes; the configured maximum is {maximum}")]
    InputTooLarge {
        /// Actual input size.
        actual: usize,
        /// Maximum accepted input size.
        maximum: usize,
    },
    /// A deterministic encoding would exceed the codec's decoding budget.
    #[error(
        "encoded editor-state JSON exceeds the configured maximum {maximum}; at least {minimum} bytes were observed"
    )]
    OutputTooLarge {
        /// Lower bound observed before serialization stopped, saturated at `usize::MAX`.
        minimum: usize,
        /// Maximum accepted input size for the same codec.
        maximum: usize,
    },
    /// The outer JSON syntax or strict record shape is invalid.
    #[error("invalid editor-state JSON: {0}")]
    InvalidJson(#[source] JsonFailure),
    /// The envelope does not identify Breditor's editor-state format.
    #[error("unsupported editor-state format `{found}`; expected `{expected}`")]
    UnsupportedFormat {
        /// Format found in the input.
        found: BoundedDiagnostic,
        /// Format accepted by this codec.
        expected: &'static str,
    },
    /// The envelope uses an unsupported wire version.
    #[error("unsupported editor-state format version {found}; this codec supports {supported}")]
    UnsupportedFormatVersion {
        /// Version found in the input.
        found: u32,
        /// Version accepted by this codec.
        supported: u32,
    },
    /// The embedded Document V1 value failed its authoritative codec boundary.
    #[error("invalid editor-state document: {0}")]
    InvalidDocument(#[source] DocumentCodecError),
    /// A non-document field could not pass checked V1 reconstruction.
    #[error(transparent)]
    InvalidEditorState(#[from] EditorStateRecordError),
    /// The reconstructed fields do not form one valid complete editor state.
    #[error(transparent)]
    Validation(#[from] EditorStateError),
    /// Serialization of a checked editor state failed.
    #[error("could not encode editor-state JSON: {0}")]
    Encoding(#[source] JsonFailure),
}

impl EditorStateCodecError {
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
            Self::InvalidDocument(source) => source.code(),
            Self::InvalidEditorState(_) => CodecErrorCode::InvalidEditorState,
            Self::Validation(_) => CodecErrorCode::ValidationFailed,
            Self::Encoding(_) => CodecErrorCode::EncodingFailed,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::EditorStateRecordErrorCode;

    #[test]
    fn editor_state_record_error_code_strings_are_stable() {
        let cases = [
            (
                EditorStateRecordErrorCode::InvalidSnapshotLineage,
                "editor_state_record.invalid_snapshot_lineage",
            ),
            (
                EditorStateRecordErrorCode::InvalidSnapshotRevision,
                "editor_state_record.invalid_snapshot_revision",
            ),
            (
                EditorStateRecordErrorCode::InvalidSelectionPath,
                "editor_state_record.invalid_selection_path",
            ),
            (
                EditorStateRecordErrorCode::InvalidQualifiedName,
                "editor_state_record.invalid_qualified_name",
            ),
            (
                EditorStateRecordErrorCode::PendingFormatLimit,
                "editor_state_record.pending_format_limit",
            ),
            (
                EditorStateRecordErrorCode::NonCanonicalPendingFormats,
                "editor_state_record.noncanonical_pending_formats",
            ),
            (
                EditorStateRecordErrorCode::PendingFormatNotAllowed,
                "editor_state_record.pending_format_not_allowed",
            ),
        ];

        for (code, expected) in cases {
            assert_eq!(code.as_str(), expected);
        }
    }
}

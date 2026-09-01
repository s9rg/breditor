use std::{error::Error, fmt};

use thiserror::Error;

use crate::{
    identity::QualifiedNameError,
    operation::{OperationKind, OperationValidationError},
    schema::{SchemaId, SchemaVersionError},
};

use super::{BoundedDiagnostic, CodecErrorCode, JsonFailure};

/// Stable category for a checked operation-record reconstruction failure.
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[non_exhaustive]
pub enum OperationRecordErrorCode {
    /// A structural path is outside the operation coordinate contract.
    InvalidPath,
    /// A UTF-16 offset is outside the cross-language coordinate contract.
    InvalidOffset,
    /// A format name does not satisfy the qualified-name grammar.
    InvalidFormatName,
    /// A format array is not sorted and unique by kind.
    NonCanonicalFormats,
    /// A formatted run is empty or exceeds a fixed-width protocol bound.
    InvalidTextRun,
    /// A fragment has a noncanonical run seam or coordinate overflow.
    NonCanonicalFragment,
    /// A range is reversed or otherwise malformed.
    InvalidRange,
    /// A guarded operation violates its closed constructor contract.
    ContractViolation,
}

impl OperationRecordErrorCode {
    /// Returns the stable code used across language boundaries.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::InvalidPath => "operation_record.invalid_path",
            Self::InvalidOffset => "operation_record.invalid_offset",
            Self::InvalidFormatName => "operation_record.invalid_format_name",
            Self::NonCanonicalFormats => "operation_record.noncanonical_formats",
            Self::InvalidTextRun => "operation_record.invalid_text_run",
            Self::NonCanonicalFragment => "operation_record.noncanonical_fragment",
            Self::InvalidRange => "operation_record.invalid_range",
            Self::ContractViolation => "operation_record.contract_violation",
        }
    }
}

/// One fixed path field in the operation V1 record.
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[non_exhaustive]
pub enum OperationPathField {
    /// `textSplice.range.containerPath`.
    TextSpliceContainer,
    /// `paragraphSplit.paragraphPath`.
    ParagraphSplitParagraph,
    /// `paragraphJoin.leftPath`.
    ParagraphJoinLeft,
    /// `rootTextReplace.range.start.paragraphPath`.
    RootTextReplaceStart,
    /// `rootTextReplace.range.end.paragraphPath`.
    RootTextReplaceEnd,
}

/// One fixed UTF-16 offset field in the operation V1 record.
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[non_exhaustive]
pub enum OperationOffsetField {
    /// `textSplice.range.start`.
    TextSpliceStart,
    /// `textSplice.range.end`.
    TextSpliceEnd,
    /// `paragraphSplit.offset`.
    ParagraphSplit,
    /// `rootTextReplace.range.start.offset`.
    RootTextReplaceStart,
    /// `rootTextReplace.range.end.offset`.
    RootTextReplaceEnd,
}

/// One semantic fragment field in the operation V1 record.
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[non_exhaustive]
pub enum OperationFragmentField {
    /// `textSplice.expectedRemoved`.
    TextSpliceExpectedRemoved,
    /// `textSplice.replacement`.
    TextSpliceReplacement,
    /// `paragraphSplit.expected`.
    ParagraphSplitExpected,
    /// `paragraphJoin.expectedLeft`.
    ParagraphJoinExpectedLeft,
    /// `paragraphJoin.expectedRight`.
    ParagraphJoinExpectedRight,
    /// One entry in `rootTextReplace.expectedParagraphs`.
    RootTextReplaceExpectedParagraph,
    /// One entry in `rootTextReplace.replacementParagraphs`.
    RootTextReplaceReplacementParagraph,
}

/// Stable location within a singular operation record.
#[derive(Clone, Debug, Eq, Hash, PartialEq)]
#[non_exhaustive]
pub enum OperationRecordLocation {
    /// The tagged operation as a whole.
    Operation(OperationKind),
    /// A structural path field.
    Path(OperationPathField),
    /// A UTF-16 offset field.
    Offset(OperationOffsetField),
    /// One fragment, with zero for every non-list field.
    Fragment {
        /// Semantic fragment field.
        field: OperationFragmentField,
        /// Index inside a paragraph-fragment list.
        paragraph_index: u64,
    },
    /// One formatted text run.
    Run {
        /// Semantic fragment field.
        field: OperationFragmentField,
        /// Index inside a paragraph-fragment list.
        paragraph_index: u64,
        /// Index inside the fragment's run list.
        run_index: u64,
    },
    /// One semantic format.
    Format {
        /// Semantic fragment field.
        field: OperationFragmentField,
        /// Index inside a paragraph-fragment list.
        paragraph_index: u64,
        /// Index inside the fragment's run list.
        run_index: u64,
        /// Index inside the run's format list.
        format_index: u64,
    },
}

/// Breditor-owned details for one invalid operation record.
///
/// The code and location are stable control-flow data. The diagnostic is for
/// humans and may become more precise without changing the wire contract.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct OperationRecordError {
    code: OperationRecordErrorCode,
    location: OperationRecordLocation,
    diagnostic: BoundedDiagnostic,
}

impl OperationRecordError {
    /// Returns the stable reconstruction failure category.
    #[must_use]
    pub const fn code(&self) -> OperationRecordErrorCode {
        self.code
    }

    /// Returns the stable field or nested-value location.
    #[must_use]
    pub const fn location(&self) -> &OperationRecordLocation {
        &self.location
    }

    /// Returns the bounded human-readable diagnostic preview.
    ///
    /// Use [`Self::diagnostic_value`] when the original byte length or
    /// truncation state matters.
    #[must_use]
    pub fn diagnostic(&self) -> &str {
        self.diagnostic.preview()
    }

    /// Returns the bounded diagnostic value and its truncation metadata.
    #[must_use]
    pub const fn diagnostic_value(&self) -> &BoundedDiagnostic {
        &self.diagnostic
    }

    pub(crate) fn new(
        code: OperationRecordErrorCode,
        location: OperationRecordLocation,
        diagnostic: impl Into<BoundedDiagnostic>,
    ) -> Self {
        Self { code, location, diagnostic: diagnostic.into() }
    }
}

impl fmt::Display for OperationRecordError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(formatter, "invalid operation record at {:?}: {}", self.location, self.diagnostic)
    }
}

impl Error for OperationRecordError {}

/// A typed failure while decoding or encoding one versioned operation.
#[derive(Debug, Error)]
#[non_exhaustive]
pub enum OperationCodecError {
    /// The input exceeds the configured UTF-8 byte limit.
    #[error("operation JSON is {actual} bytes; the configured maximum is {maximum}")]
    InputTooLarge {
        /// Actual input size.
        actual: usize,
        /// Maximum accepted input size.
        maximum: usize,
    },
    /// A deterministic encoding would exceed the codec's decoding budget.
    #[error("encoded operation JSON is {actual} bytes; the configured maximum is {maximum}")]
    OutputTooLarge {
        /// Actual encoded size.
        actual: usize,
        /// Maximum accepted input size for the same codec.
        maximum: usize,
    },
    /// The JSON syntax or strict record shape is invalid.
    #[error("invalid operation JSON: {0}")]
    InvalidJson(#[source] JsonFailure),
    /// The envelope does not identify Breditor's operation format.
    #[error("unsupported operation format `{found}`; expected `{expected}`")]
    UnsupportedFormat {
        /// Format found in the input.
        found: BoundedDiagnostic,
        /// Format accepted by this codec.
        expected: &'static str,
    },
    /// The envelope uses an unsupported wire version.
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
    /// The input targets a different schema than this codec.
    #[error("schema mismatch: input targets `{found}`, codec expects `{expected}`")]
    SchemaMismatch {
        /// Schema expected by the codec.
        expected: SchemaId,
        /// Schema encoded by the operation.
        found: SchemaId,
    },
    /// The strict record could not pass checked runtime constructors.
    #[error(transparent)]
    InvalidOperation(#[from] OperationRecordError),
    /// The reconstructed or supplied operation violates the active context.
    #[error(transparent)]
    Validation(#[from] OperationValidationError),
    /// Serialization of a checked runtime operation failed.
    #[error("could not encode operation JSON: {0}")]
    Encoding(#[source] JsonFailure),
}

impl OperationCodecError {
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
            Self::InvalidOperation(_) => CodecErrorCode::InvalidOperation,
            Self::Validation(_) => CodecErrorCode::ValidationFailed,
            Self::Encoding(_) => CodecErrorCode::EncodingFailed,
        }
    }
}

#[cfg(test)]
mod tests {
    use crate::{codec::MAX_DIAGNOSTIC_PREVIEW_BYTES, operation::OperationKind};

    use super::{OperationRecordError, OperationRecordErrorCode, OperationRecordLocation};

    #[test]
    fn operation_record_error_bounds_owned_diagnostic_text() {
        let diagnostic = "x".repeat(MAX_DIAGNOSTIC_PREVIEW_BYTES * 4);
        let original_byte_len = diagnostic.len();
        let error = OperationRecordError::new(
            OperationRecordErrorCode::ContractViolation,
            OperationRecordLocation::Operation(OperationKind::TextSplice),
            diagnostic,
        );

        assert!(error.diagnostic().len() <= MAX_DIAGNOSTIC_PREVIEW_BYTES);
        assert!(error.diagnostic_value().is_truncated());
        assert_eq!(error.diagnostic_value().original_byte_len(), original_byte_len);
    }
}

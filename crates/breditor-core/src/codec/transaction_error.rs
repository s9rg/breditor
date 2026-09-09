use std::{error::Error, fmt};

use thiserror::Error;

use crate::{
    operation::OperationValidationError,
    schema::{SchemaId, SchemaVersionError},
    state::SnapshotId,
};

use super::{BoundedDiagnostic, CodecErrorCode, JsonFailure, OperationRecordError};

/// Stable category for a checked transaction-record reconstruction failure.
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[non_exhaustive]
pub enum TransactionRecordErrorCode {
    /// The base lineage does not satisfy the portable identity grammar.
    InvalidBaseLineage,
    /// The base revision is not a canonical decimal `u64` string.
    InvalidBaseRevision,
    /// A selection point path exceeds the fixed protocol depth.
    InvalidSelectionPath,
    /// A pending-format or metadata name is not a qualified name.
    InvalidQualifiedName,
    /// A pending-format property name is not a qualified name.
    InvalidPendingFormatPropertyName,
    /// A pending-format property value violates the deterministic value contract.
    InvalidPendingFormatPropertyValue,
    /// A pending-format array exceeds the active context limit.
    PendingFormatLimit,
    /// Pending formats are not sorted and unique by kind.
    NonCanonicalPendingFormats,
    /// A pending format is not representable in its wire generation or allowed by the schema.
    PendingFormatNotAllowed,
    /// Pending formats exceed the aggregate property-value ceiling.
    PendingFormatPropertyValueLimit,
    /// Pending formats exceed the aggregate property-string byte ceiling.
    PendingFormatPropertyStringBytesLimit,
}

impl TransactionRecordErrorCode {
    /// Returns the stable code used across language boundaries.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::InvalidBaseLineage => "transaction_record.invalid_base_lineage",
            Self::InvalidBaseRevision => "transaction_record.invalid_base_revision",
            Self::InvalidSelectionPath => "transaction_record.invalid_selection_path",
            Self::InvalidQualifiedName => "transaction_record.invalid_qualified_name",
            Self::InvalidPendingFormatPropertyName => {
                "transaction_record.invalid_pending_format_property_name"
            }
            Self::InvalidPendingFormatPropertyValue => {
                "transaction_record.invalid_pending_format_property_value"
            }
            Self::PendingFormatLimit => "transaction_record.pending_format_limit",
            Self::NonCanonicalPendingFormats => "transaction_record.noncanonical_pending_formats",
            Self::PendingFormatNotAllowed => "transaction_record.pending_format_not_allowed",
            Self::PendingFormatPropertyValueLimit => {
                "transaction_record.pending_format_property_value_limit"
            }
            Self::PendingFormatPropertyStringBytesLimit => {
                "transaction_record.pending_format_property_string_bytes_limit"
            }
        }
    }
}

/// Stable location within a transaction-request record.
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[non_exhaustive]
pub enum TransactionRecordLocation {
    /// `baseSnapshot.lineage`.
    BaseLineage,
    /// `baseSnapshot.revision`.
    BaseRevision,
    /// The explicit selection's anchor point.
    SelectionAnchor,
    /// The explicit selection's focus point.
    SelectionFocus,
    /// The complete `pendingFormatsUpdate.formats` array.
    PendingFormats,
    /// One entry in `pendingFormatsUpdate.formats`.
    PendingFormat {
        /// Zero-based format index.
        format_index: u64,
    },
    /// `metadata.action`.
    MetadataAction,
    /// `metadata.history.group`.
    MetadataHistoryGroup,
}

/// Breditor-owned details for one invalid transaction-request field.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TransactionRecordError {
    code: TransactionRecordErrorCode,
    location: TransactionRecordLocation,
    diagnostic: BoundedDiagnostic,
}

impl TransactionRecordError {
    /// Returns the stable reconstruction failure category.
    #[must_use]
    pub const fn code(&self) -> TransactionRecordErrorCode {
        self.code
    }

    /// Returns the stable field or nested-value location.
    #[must_use]
    pub const fn location(&self) -> TransactionRecordLocation {
        self.location
    }

    /// Returns the bounded human-readable diagnostic preview.
    #[must_use]
    pub fn diagnostic(&self) -> &str {
        self.diagnostic.preview()
    }

    /// Returns the bounded diagnostic and its truncation metadata.
    #[must_use]
    pub const fn diagnostic_value(&self) -> &BoundedDiagnostic {
        &self.diagnostic
    }

    pub(crate) fn new(
        code: TransactionRecordErrorCode,
        location: TransactionRecordLocation,
        diagnostic: impl Into<BoundedDiagnostic>,
    ) -> Self {
        Self { code, location, diagnostic: diagnostic.into() }
    }
}

impl fmt::Display for TransactionRecordError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(formatter, "invalid transaction record at {:?}: {}", self.location, self.diagnostic)
    }
}

impl Error for TransactionRecordError {}

/// A typed failure while decoding or encoding one transaction request.
#[derive(Debug, Error)]
#[non_exhaustive]
pub enum TransactionCodecError {
    /// The supplied base was proved under a different runtime context.
    #[error("transaction codec context differs from the supplied base-state context")]
    ContextConfigurationMismatch,
    /// The input exceeds the configured UTF-8 byte limit.
    #[error("transaction JSON is {actual} bytes; the configured maximum is {maximum}")]
    InputTooLarge {
        /// Actual input size.
        actual: usize,
        /// Maximum accepted input size.
        maximum: usize,
    },
    /// A deterministic encoding would exceed the codec's decoding budget.
    #[error(
        "encoded transaction JSON exceeds the configured maximum {maximum}; at least {minimum} bytes were observed"
    )]
    OutputTooLarge {
        /// Lower bound observed before serialization stopped, saturated at `usize::MAX`.
        minimum: usize,
        /// Maximum accepted input size for the same codec.
        maximum: usize,
    },
    /// The JSON syntax or strict record shape is invalid.
    #[error("invalid transaction JSON: {0}")]
    InvalidJson(#[source] JsonFailure),
    /// One operation payload has invalid strict JSON shape.
    #[error("invalid transaction operation JSON at index {operation_index}: {source}")]
    InvalidOperationJson {
        /// Zero-based operation index.
        operation_index: u64,
        /// Strict JSON record failure.
        #[source]
        source: JsonFailure,
    },
    /// The envelope does not identify Breditor's transaction-request format.
    #[error("unsupported transaction format `{found}`; expected `{expected}`")]
    UnsupportedFormat {
        /// Format found in the input.
        found: BoundedDiagnostic,
        /// Format accepted by this codec.
        expected: &'static str,
    },
    /// The envelope uses an unsupported wire version.
    #[error("unsupported transaction format version {found}; this codec supports {supported}")]
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
        source: crate::identity::QualifiedNameError,
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
        /// Schema encoded by the request.
        found: SchemaId,
    },
    /// The encoded request targets a different base snapshot.
    #[error("base snapshot mismatch: input targets {found:?}, supplied base is {expected:?}")]
    BaseSnapshotMismatch {
        /// Snapshot owned by the supplied base state.
        expected: SnapshotId,
        /// Snapshot encoded by the request.
        found: SnapshotId,
    },
    /// The request exceeds the configured atomic operation budget.
    #[error("transaction has {actual} operations; the configured maximum is {maximum}")]
    OperationLimit {
        /// Actual operation count.
        actual: u64,
        /// Configured maximum.
        maximum: u32,
    },
    /// A non-operation field could not pass checked runtime construction.
    #[error(transparent)]
    InvalidTransaction(#[from] TransactionRecordError),
    /// One operation could not pass checked runtime construction.
    #[error("invalid operation at transaction index {operation_index}: {source}")]
    InvalidOperation {
        /// Zero-based operation index.
        operation_index: u64,
        /// Checked operation-record failure.
        #[source]
        source: OperationRecordError,
    },
    /// One reconstructed operation violates the codec's active context.
    #[error("operation at transaction index {operation_index} failed validation: {source}")]
    OperationValidation {
        /// Zero-based operation index.
        operation_index: u64,
        /// Context-static operation failure.
        #[source]
        source: OperationValidationError,
    },
    /// Serialization of a checked transaction failed.
    #[error("could not encode transaction JSON: {0}")]
    Encoding(#[source] JsonFailure),
}

impl TransactionCodecError {
    /// Returns the stable machine-readable failure category.
    #[must_use]
    pub const fn code(&self) -> CodecErrorCode {
        match self {
            Self::ContextConfigurationMismatch => CodecErrorCode::ContextMismatch,
            Self::InputTooLarge { .. } => CodecErrorCode::InputTooLarge,
            Self::OutputTooLarge { .. } => CodecErrorCode::OutputTooLarge,
            Self::InvalidJson(_) | Self::InvalidOperationJson { .. } => CodecErrorCode::InvalidJson,
            Self::UnsupportedFormat { .. } => CodecErrorCode::UnsupportedFormat,
            Self::UnsupportedFormatVersion { .. } => CodecErrorCode::UnsupportedFormatVersion,
            Self::InvalidSchemaName { .. } => CodecErrorCode::InvalidSchemaName,
            Self::InvalidSchemaVersion { .. } => CodecErrorCode::InvalidSchemaVersion,
            Self::SchemaMismatch { .. } => CodecErrorCode::SchemaMismatch,
            Self::BaseSnapshotMismatch { .. } => CodecErrorCode::SnapshotMismatch,
            Self::OperationLimit { .. } => CodecErrorCode::ResourceLimit,
            Self::InvalidTransaction(_) => CodecErrorCode::InvalidTransaction,
            Self::InvalidOperation { .. } => CodecErrorCode::InvalidOperation,
            Self::OperationValidation { .. } => CodecErrorCode::ValidationFailed,
            Self::Encoding(_) => CodecErrorCode::EncodingFailed,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::TransactionRecordErrorCode;

    #[test]
    fn transaction_record_error_code_strings_are_stable() {
        let cases = [
            (
                TransactionRecordErrorCode::InvalidBaseLineage,
                "transaction_record.invalid_base_lineage",
            ),
            (
                TransactionRecordErrorCode::InvalidBaseRevision,
                "transaction_record.invalid_base_revision",
            ),
            (
                TransactionRecordErrorCode::InvalidSelectionPath,
                "transaction_record.invalid_selection_path",
            ),
            (
                TransactionRecordErrorCode::InvalidQualifiedName,
                "transaction_record.invalid_qualified_name",
            ),
            (
                TransactionRecordErrorCode::InvalidPendingFormatPropertyName,
                "transaction_record.invalid_pending_format_property_name",
            ),
            (
                TransactionRecordErrorCode::InvalidPendingFormatPropertyValue,
                "transaction_record.invalid_pending_format_property_value",
            ),
            (
                TransactionRecordErrorCode::PendingFormatLimit,
                "transaction_record.pending_format_limit",
            ),
            (
                TransactionRecordErrorCode::NonCanonicalPendingFormats,
                "transaction_record.noncanonical_pending_formats",
            ),
            (
                TransactionRecordErrorCode::PendingFormatNotAllowed,
                "transaction_record.pending_format_not_allowed",
            ),
            (
                TransactionRecordErrorCode::PendingFormatPropertyValueLimit,
                "transaction_record.pending_format_property_value_limit",
            ),
            (
                TransactionRecordErrorCode::PendingFormatPropertyStringBytesLimit,
                "transaction_record.pending_format_property_string_bytes_limit",
            ),
        ];

        for (code, expected) in cases {
            assert_eq!(code.as_str(), expected);
        }
    }
}

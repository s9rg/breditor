use std::{error::Error, fmt};

use thiserror::Error;

use crate::{
    operation::OperationValidationError, state::RevisionError, transaction::TransactionApplyError,
};

use super::{
    BoundedDiagnostic, CodecErrorCode, EditorStateCodecError, JsonFailure, OperationRecordError,
};

/// Stable category for a checked commit-record reconstruction failure.
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[non_exhaustive]
pub enum CommitRecordErrorCode {
    /// A result-selection point path exceeds the fixed protocol depth.
    InvalidSelectionPath,
    /// A result pending-format or metadata name is not a qualified name.
    InvalidQualifiedName,
    /// A result pending-format property name is not a qualified name.
    InvalidPendingFormatPropertyName,
    /// A result pending-format property value is outside the deterministic value model.
    InvalidPendingFormatPropertyValue,
    /// The result pending-format array exceeds the active context limit.
    PendingFormatLimit,
    /// Result pending formats are not sorted and unique by kind.
    NonCanonicalPendingFormats,
    /// A result pending format is not representable by the active wire generation or schema.
    PendingFormatNotAllowed,
    /// Result pending formats exceed the aggregate property-value ceiling.
    PendingFormatPropertyValueLimit,
    /// Result pending formats exceed the aggregate property-string byte ceiling.
    PendingFormatPropertyStringBytesLimit,
}

impl CommitRecordErrorCode {
    /// Returns the stable code used across language boundaries.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::InvalidSelectionPath => "commit_record.invalid_selection_path",
            Self::InvalidQualifiedName => "commit_record.invalid_qualified_name",
            Self::InvalidPendingFormatPropertyName => {
                "commit_record.invalid_pending_format_property_name"
            }
            Self::InvalidPendingFormatPropertyValue => {
                "commit_record.invalid_pending_format_property_value"
            }
            Self::PendingFormatLimit => "commit_record.pending_format_limit",
            Self::NonCanonicalPendingFormats => "commit_record.noncanonical_pending_formats",
            Self::PendingFormatNotAllowed => "commit_record.pending_format_not_allowed",
            Self::PendingFormatPropertyValueLimit => {
                "commit_record.pending_format_property_value_limit"
            }
            Self::PendingFormatPropertyStringBytesLimit => {
                "commit_record.pending_format_property_string_bytes_limit"
            }
        }
    }
}

/// Stable location within a durable commit record.
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[non_exhaustive]
pub enum CommitRecordLocation {
    /// The `resultSelection` anchor point.
    ResultSelectionAnchor,
    /// The `resultSelection` focus point.
    ResultSelectionFocus,
    /// The complete `resultPendingFormats` array.
    ResultPendingFormats,
    /// One entry in `resultPendingFormats`.
    ResultPendingFormat {
        /// Zero-based format index.
        format_index: u64,
    },
    /// `metadata.action`.
    MetadataAction,
    /// `metadata.history.group`.
    MetadataHistoryGroup,
}

/// Breditor-owned details for one invalid durable-commit field.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CommitRecordError {
    code: CommitRecordErrorCode,
    location: CommitRecordLocation,
    diagnostic: BoundedDiagnostic,
}

impl CommitRecordError {
    /// Returns the stable reconstruction failure category.
    #[must_use]
    pub const fn code(&self) -> CommitRecordErrorCode {
        self.code
    }

    /// Returns the stable rejected-field location.
    #[must_use]
    pub const fn location(&self) -> CommitRecordLocation {
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
        code: CommitRecordErrorCode,
        location: CommitRecordLocation,
        diagnostic: impl Into<BoundedDiagnostic>,
    ) -> Self {
        Self { code, location, diagnostic: diagnostic.into() }
    }
}

impl fmt::Display for CommitRecordError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(formatter, "invalid commit record at {:?}: {}", self.location, self.diagnostic)
    }
}

impl Error for CommitRecordError {}

/// Stable category for a failure while replay-proving a commit record.
///
/// This is a bounded projection rather than the original transaction error:
/// operation application errors can own guarded document fragments, which an
/// untrusted codec failure must not retain or expose through `Debug` output.
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[non_exhaustive]
pub enum CommitApplicationErrorCode {
    /// Transaction and execution context used different schemas.
    ContextSchemaMismatch,
    /// Equal schema identities hid different execution configuration.
    ContextConfigurationMismatch,
    /// The reconstructed transaction named another snapshot.
    StaleSnapshot,
    /// The exact snapshot identity was reused for unequal state.
    BaseStateMismatch,
    /// The reconstructed transaction exceeded the operation ceiling.
    OperationLimit,
    /// One guarded operation could not apply to the embedded before state.
    Operation,
    /// Automatic selection relocation failed.
    SelectionRelocation,
    /// The derived result state failed publication validation.
    InvalidResultState,
    /// The before-state revision has no representable successor.
    RevisionOverflow,
}

impl CommitApplicationErrorCode {
    /// Returns the stable code used across language boundaries.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::ContextSchemaMismatch => "commit_application.context_schema_mismatch",
            Self::ContextConfigurationMismatch => {
                "commit_application.context_configuration_mismatch"
            }
            Self::StaleSnapshot => "commit_application.stale_snapshot",
            Self::BaseStateMismatch => "commit_application.base_state_mismatch",
            Self::OperationLimit => "commit_application.operation_limit",
            Self::Operation => "commit_application.operation",
            Self::SelectionRelocation => "commit_application.selection_relocation",
            Self::InvalidResultState => "commit_application.invalid_result_state",
            Self::RevisionOverflow => "commit_application.revision_overflow",
        }
    }
}

/// Bounded details from replaying a reconstructed commit transaction.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CommitApplicationError {
    code: CommitApplicationErrorCode,
    operation_index: Option<u64>,
    diagnostic: BoundedDiagnostic,
}

impl CommitApplicationError {
    /// Returns the stable replay-failure category.
    #[must_use]
    pub const fn code(&self) -> CommitApplicationErrorCode {
        self.code
    }

    /// Returns the failing forward-operation index when one operation failed.
    #[must_use]
    pub const fn operation_index(&self) -> Option<u64> {
        self.operation_index
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

    pub(crate) fn from_transaction(error: &TransactionApplyError) -> Self {
        let (code, operation_index) = match error {
            TransactionApplyError::ContextSchemaMismatch { .. } => {
                (CommitApplicationErrorCode::ContextSchemaMismatch, None)
            }
            TransactionApplyError::ContextConfigurationMismatch => {
                (CommitApplicationErrorCode::ContextConfigurationMismatch, None)
            }
            TransactionApplyError::StaleSnapshot { .. } => {
                (CommitApplicationErrorCode::StaleSnapshot, None)
            }
            TransactionApplyError::BaseStateMismatch { .. } => {
                (CommitApplicationErrorCode::BaseStateMismatch, None)
            }
            TransactionApplyError::OperationLimit { .. } => {
                (CommitApplicationErrorCode::OperationLimit, None)
            }
            TransactionApplyError::Operation { operation_index, .. } => {
                (CommitApplicationErrorCode::Operation, Some(*operation_index))
            }
            TransactionApplyError::SelectionRelocation(_) => {
                (CommitApplicationErrorCode::SelectionRelocation, None)
            }
            TransactionApplyError::InvalidResultState(_) => {
                (CommitApplicationErrorCode::InvalidResultState, None)
            }
            TransactionApplyError::Revision(RevisionError::Overflow) => {
                (CommitApplicationErrorCode::RevisionOverflow, None)
            }
        };
        Self { code, operation_index, diagnostic: BoundedDiagnostic::from(error.to_string()) }
    }
}

impl fmt::Display for CommitApplicationError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        if let Some(operation_index) = self.operation_index {
            write!(
                formatter,
                "commit replay failed at operation {operation_index}: {}",
                self.diagnostic
            )
        } else {
            write!(formatter, "commit replay failed: {}", self.diagnostic)
        }
    }
}

impl Error for CommitApplicationError {}

/// A typed failure while decoding or encoding one durable commit.
#[derive(Debug, Error)]
#[non_exhaustive]
pub enum CommitCodecError {
    /// The supplied commit was proved under a different runtime context.
    #[error("commit codec context differs from the supplied commit context")]
    ContextConfigurationMismatch,
    /// The input exceeds the configured UTF-8 byte limit.
    #[error("commit JSON is {actual} bytes; the configured maximum is {maximum}")]
    InputTooLarge {
        /// Actual input size.
        actual: usize,
        /// Maximum accepted input size.
        maximum: usize,
    },
    /// A deterministic encoding would exceed the codec's decoding budget.
    #[error(
        "encoded commit JSON exceeds the configured maximum {maximum}; at least {minimum} bytes were observed"
    )]
    OutputTooLarge {
        /// Lower bound observed before serialization stopped, saturated at `usize::MAX`.
        minimum: usize,
        /// Maximum accepted input size for the same codec.
        maximum: usize,
    },
    /// The outer JSON syntax or strict record shape is invalid.
    #[error("invalid commit JSON: {0}")]
    InvalidJson(#[source] JsonFailure),
    /// One forward-operation payload has invalid strict JSON shape.
    #[error("invalid commit operation JSON at index {operation_index}: {source}")]
    InvalidOperationJson {
        /// Zero-based operation index.
        operation_index: u64,
        /// Strict JSON record failure.
        #[source]
        source: JsonFailure,
    },
    /// The envelope does not identify Breditor's commit format.
    #[error("unsupported commit format `{found}`; expected `{expected}`")]
    UnsupportedFormat {
        /// Format found in the input.
        found: BoundedDiagnostic,
        /// Format accepted by this codec.
        expected: &'static str,
    },
    /// The envelope uses an unsupported wire version.
    #[error("unsupported commit format version {found}; this codec supports {supported}")]
    UnsupportedFormatVersion {
        /// Version found in the input.
        found: u32,
        /// Version accepted by this codec.
        supported: u32,
    },
    /// The embedded before-state checkpoint failed its authoritative codec boundary.
    #[error("invalid commit before-state checkpoint: {0}")]
    InvalidBeforeState(#[source] EditorStateCodecError),
    /// The forward sequence exceeds the configured atomic operation budget.
    #[error("commit has {actual} forward operations; the configured maximum is {maximum}")]
    OperationLimit {
        /// Actual operation count.
        actual: u64,
        /// Configured maximum.
        maximum: u32,
    },
    /// A non-operation commit field could not pass checked reconstruction.
    #[error(transparent)]
    InvalidCommit(#[from] CommitRecordError),
    /// One forward operation could not pass checked runtime construction.
    #[error("invalid operation at commit index {operation_index}: {source}")]
    InvalidOperation {
        /// Zero-based operation index.
        operation_index: u64,
        /// Checked operation-record failure.
        #[source]
        source: OperationRecordError,
    },
    /// One reconstructed forward operation violates the codec's active context.
    #[error("operation at commit index {operation_index} failed validation: {source}")]
    OperationValidation {
        /// Zero-based operation index.
        operation_index: u64,
        /// Context-static operation failure.
        #[source]
        source: OperationValidationError,
    },
    /// Replaying the reconstructed forward transaction failed.
    #[error("could not apply reconstructed commit: {0}")]
    Apply(#[source] CommitApplicationError),
    /// The record describes neither an applied operation nor a result-state change.
    #[error("commit record reconstructs to an unchanged transaction")]
    UnexpectedUnchanged,
    /// Applying the wire sequence filtered at least one unchanged operation.
    #[error("commit forward operations are noncanonical at index {operation_index}")]
    NonCanonicalForwardOperations {
        /// First zero-based wire index that differs from the canonical applied sequence.
        operation_index: u64,
    },
    /// Serialization of a checked commit failed.
    #[error("could not encode commit JSON: {0}")]
    Encoding(#[source] JsonFailure),
}

impl CommitCodecError {
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
            Self::InvalidBeforeState(source) => source.code(),
            Self::OperationLimit { .. } => CodecErrorCode::ResourceLimit,
            Self::InvalidCommit(_)
            | Self::Apply(_)
            | Self::UnexpectedUnchanged
            | Self::NonCanonicalForwardOperations { .. } => CodecErrorCode::InvalidCommit,
            Self::InvalidOperation { .. } => CodecErrorCode::InvalidOperation,
            Self::OperationValidation { .. } => CodecErrorCode::ValidationFailed,
            Self::Encoding(_) => CodecErrorCode::EncodingFailed,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{CommitApplicationErrorCode, CommitRecordErrorCode};

    #[test]
    fn commit_record_error_code_strings_are_stable() {
        let cases = [
            (CommitRecordErrorCode::InvalidSelectionPath, "commit_record.invalid_selection_path"),
            (CommitRecordErrorCode::InvalidQualifiedName, "commit_record.invalid_qualified_name"),
            (
                CommitRecordErrorCode::InvalidPendingFormatPropertyName,
                "commit_record.invalid_pending_format_property_name",
            ),
            (
                CommitRecordErrorCode::InvalidPendingFormatPropertyValue,
                "commit_record.invalid_pending_format_property_value",
            ),
            (CommitRecordErrorCode::PendingFormatLimit, "commit_record.pending_format_limit"),
            (
                CommitRecordErrorCode::NonCanonicalPendingFormats,
                "commit_record.noncanonical_pending_formats",
            ),
            (
                CommitRecordErrorCode::PendingFormatNotAllowed,
                "commit_record.pending_format_not_allowed",
            ),
            (
                CommitRecordErrorCode::PendingFormatPropertyValueLimit,
                "commit_record.pending_format_property_value_limit",
            ),
            (
                CommitRecordErrorCode::PendingFormatPropertyStringBytesLimit,
                "commit_record.pending_format_property_string_bytes_limit",
            ),
        ];

        for (code, expected) in cases {
            assert_eq!(code.as_str(), expected);
        }
    }

    #[test]
    fn commit_application_error_code_strings_are_stable() {
        let cases = [
            (
                CommitApplicationErrorCode::ContextSchemaMismatch,
                "commit_application.context_schema_mismatch",
            ),
            (
                CommitApplicationErrorCode::ContextConfigurationMismatch,
                "commit_application.context_configuration_mismatch",
            ),
            (CommitApplicationErrorCode::StaleSnapshot, "commit_application.stale_snapshot"),
            (
                CommitApplicationErrorCode::BaseStateMismatch,
                "commit_application.base_state_mismatch",
            ),
            (CommitApplicationErrorCode::OperationLimit, "commit_application.operation_limit"),
            (CommitApplicationErrorCode::Operation, "commit_application.operation"),
            (
                CommitApplicationErrorCode::SelectionRelocation,
                "commit_application.selection_relocation",
            ),
            (
                CommitApplicationErrorCode::InvalidResultState,
                "commit_application.invalid_result_state",
            ),
            (CommitApplicationErrorCode::RevisionOverflow, "commit_application.revision_overflow"),
        ];

        for (code, expected) in cases {
            assert_eq!(code.as_str(), expected);
        }
    }
}

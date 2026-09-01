use std::{error::Error, fmt};

use thiserror::Error;

use crate::{
    operation::OperationValidationError,
    state::{Revision, RevisionError},
    transaction::TransactionApplyError,
};

use super::{
    BoundedDiagnostic, CodecErrorCode, EditorStateCodecError, JsonFailure, OperationRecordError,
};

/// Stable category for a checked session-checkpoint field failure.
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[non_exhaustive]
pub enum SessionCheckpointRecordErrorCode {
    /// `currentRevision` is not a canonical decimal `u64` string.
    InvalidCurrentRevision,
    /// A selection point path exceeds the fixed protocol depth.
    InvalidSelectionPath,
    /// The open merge group or one result format is not a qualified name.
    InvalidQualifiedName,
    /// One entry's result pending formats exceed the active context limit.
    PendingFormatLimit,
    /// Result pending formats are not sorted and unique by kind.
    NonCanonicalPendingFormats,
    /// A result pending format is not representable in V1 or allowed by the active schema.
    PendingFormatNotAllowed,
}

impl SessionCheckpointRecordErrorCode {
    /// Returns the stable code used across language boundaries.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::InvalidCurrentRevision => "session_checkpoint_record.invalid_current_revision",
            Self::InvalidSelectionPath => "session_checkpoint_record.invalid_selection_path",
            Self::InvalidQualifiedName => "session_checkpoint_record.invalid_qualified_name",
            Self::PendingFormatLimit => "session_checkpoint_record.pending_format_limit",
            Self::NonCanonicalPendingFormats => {
                "session_checkpoint_record.noncanonical_pending_formats"
            }
            Self::PendingFormatNotAllowed => "session_checkpoint_record.pending_format_not_allowed",
        }
    }
}

/// Stable location within a session checkpoint.
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[non_exhaustive]
pub enum SessionCheckpointRecordLocation {
    /// Top-level `currentRevision`.
    CurrentRevision,
    /// Top-level `openMergeGroup`.
    OpenMergeGroup,
    /// One history entry's result-selection anchor.
    EntryResultSelectionAnchor {
        /// Zero-based chronological entry index.
        entry_index: u64,
    },
    /// One history entry's result-selection focus.
    EntryResultSelectionFocus {
        /// Zero-based chronological entry index.
        entry_index: u64,
    },
    /// One history entry's complete result pending-format array.
    EntryResultPendingFormats {
        /// Zero-based chronological entry index.
        entry_index: u64,
    },
    /// One result pending format within one history entry.
    EntryResultPendingFormat {
        /// Zero-based chronological entry index.
        entry_index: u64,
        /// Zero-based result-format index.
        format_index: u64,
    },
}

/// Breditor-owned details for one invalid session-checkpoint field.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SessionCheckpointRecordError {
    code: SessionCheckpointRecordErrorCode,
    location: SessionCheckpointRecordLocation,
    diagnostic: BoundedDiagnostic,
}

impl SessionCheckpointRecordError {
    /// Returns the stable reconstruction failure category.
    #[must_use]
    pub const fn code(&self) -> SessionCheckpointRecordErrorCode {
        self.code
    }

    /// Returns the stable rejected-field location.
    #[must_use]
    pub const fn location(&self) -> SessionCheckpointRecordLocation {
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
        code: SessionCheckpointRecordErrorCode,
        location: SessionCheckpointRecordLocation,
        diagnostic: impl Into<BoundedDiagnostic>,
    ) -> Self {
        Self { code, location, diagnostic: diagnostic.into() }
    }
}

impl fmt::Display for SessionCheckpointRecordError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            formatter,
            "invalid session-checkpoint record at {:?}: {}",
            self.location, self.diagnostic
        )
    }
}

impl Error for SessionCheckpointRecordError {}

/// Stable category for an impossible linear-history topology.
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[non_exhaustive]
pub enum SessionCheckpointTopologyErrorCode {
    /// The complete retained entry count exceeds the encoded history capacity.
    EntryCountExceedsCapacity,
    /// The encoded history cursor is beyond the retained entries.
    CursorOutOfBounds,
    /// A retained history entry has no content operations.
    EmptyEntryOperations,
    /// An open merge group exists without an undo entry.
    OpenMergeGroupWithoutUndo,
    /// An open merge group crosses a nonempty redo branch.
    OpenMergeGroupWithRedo,
}

impl SessionCheckpointTopologyErrorCode {
    /// Returns the stable code used across language boundaries.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::EntryCountExceedsCapacity => {
                "session_checkpoint_topology.entry_count_exceeds_capacity"
            }
            Self::CursorOutOfBounds => "session_checkpoint_topology.cursor_out_of_bounds",
            Self::EmptyEntryOperations => "session_checkpoint_topology.empty_entry_operations",
            Self::OpenMergeGroupWithoutUndo => {
                "session_checkpoint_topology.open_merge_group_without_undo"
            }
            Self::OpenMergeGroupWithRedo => {
                "session_checkpoint_topology.open_merge_group_with_redo"
            }
        }
    }
}

/// Why decoded history fields cannot describe one complete linear history.
#[derive(Clone, Debug, Eq, Error, PartialEq)]
#[non_exhaustive]
pub enum SessionCheckpointTopologyError {
    /// The complete retained entry count exceeds the encoded history capacity.
    #[error("session checkpoint has {actual} entries but capacity is {capacity}")]
    EntryCountExceedsCapacity {
        /// Complete undo-plus-redo entry count.
        actual: u64,
        /// Encoded history capacity.
        capacity: u32,
    },
    /// The cursor is beyond the complete retained history.
    #[error("session checkpoint cursor {cursor} exceeds entry count {entries}")]
    CursorOutOfBounds {
        /// Encoded cursor, equal to the intended undo depth.
        cursor: u64,
        /// Complete retained entry count.
        entries: u64,
    },
    /// A content-history entry has no forward operations.
    #[error("session checkpoint entry {entry_index} has no forward operations")]
    EmptyEntryOperations {
        /// Zero-based chronological entry index.
        entry_index: u64,
    },
    /// An open merge group has no immediately preceding undo entry.
    #[error("session checkpoint has an open merge group without an undo entry")]
    OpenMergeGroupWithoutUndo,
    /// An open merge group cannot survive across a redo branch.
    #[error(
        "session checkpoint has an open merge group at cursor {cursor} before entry count {entries}"
    )]
    OpenMergeGroupWithRedo {
        /// Encoded cursor.
        cursor: u64,
        /// Complete retained entry count.
        entries: u64,
    },
}

impl SessionCheckpointTopologyError {
    /// Returns the stable topology failure category.
    #[must_use]
    pub const fn code(&self) -> SessionCheckpointTopologyErrorCode {
        match self {
            Self::EntryCountExceedsCapacity { .. } => {
                SessionCheckpointTopologyErrorCode::EntryCountExceedsCapacity
            }
            Self::CursorOutOfBounds { .. } => SessionCheckpointTopologyErrorCode::CursorOutOfBounds,
            Self::EmptyEntryOperations { .. } => {
                SessionCheckpointTopologyErrorCode::EmptyEntryOperations
            }
            Self::OpenMergeGroupWithoutUndo => {
                SessionCheckpointTopologyErrorCode::OpenMergeGroupWithoutUndo
            }
            Self::OpenMergeGroupWithRedo { .. } => {
                SessionCheckpointTopologyErrorCode::OpenMergeGroupWithRedo
            }
        }
    }
}

/// Retained state-summary dimension bounded across the complete history chain.
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[non_exhaustive]
pub enum RetainedResourceKind {
    /// Logical element-plus-text node count.
    Nodes,
    /// Combined UTF-8 text bytes.
    TextBytes,
    /// Top-level and recursively nested property values.
    PropertyValues,
}

impl RetainedResourceKind {
    /// Returns the stable code used across language boundaries.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Nodes => "session_checkpoint_resource.retained_nodes",
            Self::TextBytes => "session_checkpoint_resource.retained_text_bytes",
            Self::PropertyValues => "session_checkpoint_resource.retained_property_values",
        }
    }
}

/// A semantic resource ceiling exceeded by a session checkpoint.
#[derive(Clone, Copy, Debug, Eq, Error, PartialEq)]
#[non_exhaustive]
pub enum SessionCheckpointResourceLimit {
    /// The wire record requests a history capacity above host policy.
    #[error("session checkpoint capacity is {actual}; the configured maximum is {maximum}")]
    HistoryCapacity {
        /// Encoded capacity.
        actual: u32,
        /// Host-authoritative maximum.
        maximum: u32,
    },
    /// One compact history entry exceeds the atomic operation ceiling.
    #[error(
        "session checkpoint entry {entry_index} has {actual} operations; the configured maximum is {maximum}"
    )]
    EntryOperations {
        /// Zero-based chronological entry index.
        entry_index: u64,
        /// Encoded forward-operation count.
        actual: u64,
        /// Context-authoritative per-entry ceiling.
        maximum: u32,
    },
    /// All entries together exceed the checkpoint replay ceiling.
    #[error(
        "session checkpoint has {actual} aggregate forward operations; the configured maximum is {maximum}"
    )]
    AggregateForwardOperations {
        /// Aggregate encoded forward-operation count.
        actual: u64,
        /// Host-authoritative aggregate ceiling.
        maximum: u64,
    },
    /// Summing the complete operation recipes exceeded the fixed-width counter.
    #[error("session checkpoint aggregate forward-operation count overflowed u64")]
    AggregateForwardOperationsOverflow,
    /// Logical retained state boundaries exceed one aggregate summary ceiling.
    #[error(
        "session checkpoint retained {kind:?} total is {actual} at boundary {boundary_index}; the configured maximum is {maximum}"
    )]
    Retained {
        /// Bounded summary dimension.
        kind: RetainedResourceKind,
        /// Zero denotes the base; an entry result uses its chronological index plus one.
        boundary_index: u64,
        /// Aggregate value after admitting this boundary.
        actual: u64,
        /// Host-authoritative aggregate ceiling.
        maximum: u64,
    },
    /// Summing one retained-state dimension exceeded the fixed-width counter.
    #[error(
        "session checkpoint retained {kind:?} total overflowed u64 at boundary {boundary_index}"
    )]
    RetainedOverflow {
        /// Bounded summary dimension whose aggregate overflowed.
        kind: RetainedResourceKind,
        /// Zero denotes the base; an entry result uses its chronological index plus one.
        boundary_index: u64,
    },
}

/// Stable category for a session-checkpoint resource rejection.
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[non_exhaustive]
pub enum SessionCheckpointResourceLimitCode {
    /// The requested runtime history capacity exceeds host policy.
    HistoryCapacity,
    /// One entry exceeds the atomic operation ceiling.
    EntryOperations,
    /// All forward recipes together exceed host policy.
    AggregateForwardOperations,
    /// The aggregate forward-operation counter overflowed.
    AggregateForwardOperationsOverflow,
    /// Logical retained boundaries exceed one host-authoritative ceiling.
    Retained,
    /// A logical retained-boundary counter overflowed.
    RetainedOverflow,
}

impl SessionCheckpointResourceLimitCode {
    /// Returns the stable code used across language boundaries.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::HistoryCapacity => "session_checkpoint_resource.history_capacity",
            Self::EntryOperations => "session_checkpoint_resource.entry_operations",
            Self::AggregateForwardOperations => {
                "session_checkpoint_resource.aggregate_forward_operations"
            }
            Self::AggregateForwardOperationsOverflow => {
                "session_checkpoint_resource.aggregate_forward_operations_overflow"
            }
            Self::Retained => "session_checkpoint_resource.retained",
            Self::RetainedOverflow => "session_checkpoint_resource.retained_overflow",
        }
    }
}

impl SessionCheckpointResourceLimit {
    /// Returns the stable machine-readable resource category.
    #[must_use]
    pub const fn code(&self) -> SessionCheckpointResourceLimitCode {
        match self {
            Self::HistoryCapacity { .. } => SessionCheckpointResourceLimitCode::HistoryCapacity,
            Self::EntryOperations { .. } => SessionCheckpointResourceLimitCode::EntryOperations,
            Self::AggregateForwardOperations { .. } => {
                SessionCheckpointResourceLimitCode::AggregateForwardOperations
            }
            Self::AggregateForwardOperationsOverflow => {
                SessionCheckpointResourceLimitCode::AggregateForwardOperationsOverflow
            }
            Self::Retained { .. } => SessionCheckpointResourceLimitCode::Retained,
            Self::RetainedOverflow { .. } => SessionCheckpointResourceLimitCode::RetainedOverflow,
        }
    }
}

/// Direction of the deterministic replay proof for a history entry.
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[non_exhaustive]
pub enum SessionCheckpointReplayDirection {
    /// Applying the wire entry from its derived source boundary.
    Forward,
    /// Applying the locally derived inverse from the entry result boundary.
    Inverse,
}

impl SessionCheckpointReplayDirection {
    /// Returns the stable name used across language boundaries.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Forward => "forward",
            Self::Inverse => "inverse",
        }
    }
}

/// Stable category for a failure while proving one compact history entry.
///
/// This projection never retains the original [`TransactionApplyError`],
/// because an operation failure can own guarded document fragments.
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[non_exhaustive]
pub enum SessionCheckpointApplicationErrorCode {
    /// Transaction and execution context used different schemas.
    ContextSchemaMismatch,
    /// Equal schema identities hid different execution configuration.
    ContextConfigurationMismatch,
    /// The reconstructed transaction named another snapshot.
    StaleSnapshot,
    /// The exact snapshot identity was reused for unequal state.
    BaseStateMismatch,
    /// The reconstructed entry exceeded the atomic operation ceiling.
    OperationLimit,
    /// One guarded operation could not apply to its derived chain boundary.
    Operation,
    /// Automatic selection relocation failed.
    SelectionRelocation,
    /// The derived entry result failed complete editor-state validation.
    InvalidResultState,
    /// A private proof revision has no representable successor.
    RevisionOverflow,
}

impl SessionCheckpointApplicationErrorCode {
    /// Returns the stable code used across language boundaries.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::ContextSchemaMismatch => "session_checkpoint_application.context_schema_mismatch",
            Self::ContextConfigurationMismatch => {
                "session_checkpoint_application.context_configuration_mismatch"
            }
            Self::StaleSnapshot => "session_checkpoint_application.stale_snapshot",
            Self::BaseStateMismatch => "session_checkpoint_application.base_state_mismatch",
            Self::OperationLimit => "session_checkpoint_application.operation_limit",
            Self::Operation => "session_checkpoint_application.operation",
            Self::SelectionRelocation => "session_checkpoint_application.selection_relocation",
            Self::InvalidResultState => "session_checkpoint_application.invalid_result_state",
            Self::RevisionOverflow => "session_checkpoint_application.revision_overflow",
        }
    }
}

/// Bounded details from replay-proving one chronological history entry.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SessionCheckpointApplicationError {
    entry_index: u64,
    direction: SessionCheckpointReplayDirection,
    code: SessionCheckpointApplicationErrorCode,
    operation_index: Option<u64>,
    diagnostic: BoundedDiagnostic,
}

impl SessionCheckpointApplicationError {
    /// Returns the failing chronological entry index.
    #[must_use]
    pub const fn entry_index(&self) -> u64 {
        self.entry_index
    }

    /// Returns which half of the bidirectional proof failed.
    #[must_use]
    pub const fn direction(&self) -> SessionCheckpointReplayDirection {
        self.direction
    }

    /// Returns the stable replay-failure category.
    #[must_use]
    pub const fn code(&self) -> SessionCheckpointApplicationErrorCode {
        self.code
    }

    /// Returns the failing entry-local operation index, when applicable.
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

    pub(crate) fn from_transaction(
        entry_index: u64,
        direction: SessionCheckpointReplayDirection,
        error: &TransactionApplyError,
    ) -> Self {
        let (code, operation_index) = match error {
            TransactionApplyError::ContextSchemaMismatch { .. } => {
                (SessionCheckpointApplicationErrorCode::ContextSchemaMismatch, None)
            }
            TransactionApplyError::ContextConfigurationMismatch => {
                (SessionCheckpointApplicationErrorCode::ContextConfigurationMismatch, None)
            }
            TransactionApplyError::StaleSnapshot { .. } => {
                (SessionCheckpointApplicationErrorCode::StaleSnapshot, None)
            }
            TransactionApplyError::BaseStateMismatch { .. } => {
                (SessionCheckpointApplicationErrorCode::BaseStateMismatch, None)
            }
            TransactionApplyError::OperationLimit { .. } => {
                (SessionCheckpointApplicationErrorCode::OperationLimit, None)
            }
            TransactionApplyError::Operation { operation_index, .. } => {
                (SessionCheckpointApplicationErrorCode::Operation, Some(*operation_index))
            }
            TransactionApplyError::SelectionRelocation(_) => {
                (SessionCheckpointApplicationErrorCode::SelectionRelocation, None)
            }
            TransactionApplyError::InvalidResultState(_) => {
                (SessionCheckpointApplicationErrorCode::InvalidResultState, None)
            }
            TransactionApplyError::Revision(RevisionError::Overflow) => {
                (SessionCheckpointApplicationErrorCode::RevisionOverflow, None)
            }
        };
        Self {
            entry_index,
            direction,
            code,
            operation_index,
            diagnostic: BoundedDiagnostic::from(error.to_string()),
        }
    }
}

impl fmt::Display for SessionCheckpointApplicationError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        if let Some(operation_index) = self.operation_index {
            write!(
                formatter,
                "session checkpoint entry {} {} replay failed at operation {operation_index}: {}",
                self.entry_index,
                self.direction.as_str(),
                self.diagnostic
            )
        } else {
            write!(
                formatter,
                "session checkpoint entry {} {} replay failed: {}",
                self.entry_index,
                self.direction.as_str(),
                self.diagnostic
            )
        }
    }
}

impl Error for SessionCheckpointApplicationError {}

/// A typed failure while decoding or encoding one durable session checkpoint.
#[derive(Debug, Error)]
#[non_exhaustive]
pub enum SessionCheckpointCodecError {
    /// The supplied session was proved under a different runtime context.
    #[error("session-checkpoint codec context differs from the supplied session context")]
    ContextConfigurationMismatch,
    /// The input exceeds the configured UTF-8 byte limit.
    #[error("session-checkpoint JSON is {actual} bytes; the configured maximum is {maximum}")]
    InputTooLarge {
        /// Actual input size.
        actual: usize,
        /// Maximum accepted input size.
        maximum: usize,
    },
    /// A deterministic encoding exceeds the codec's decoding budget.
    #[error(
        "encoded session-checkpoint JSON exceeds the configured maximum {maximum}; at least {minimum} bytes were observed"
    )]
    OutputTooLarge {
        /// Lower bound observed before serialization stopped, saturated at `usize::MAX`.
        minimum: usize,
        /// Maximum accepted input size for the same codec.
        maximum: usize,
    },
    /// The outer JSON syntax or strict record shape is invalid.
    #[error("invalid session-checkpoint JSON: {0}")]
    InvalidJson(#[source] JsonFailure),
    /// One history entry has invalid strict JSON outside an operation payload.
    #[error("invalid session-checkpoint entry JSON at index {entry_index}: {source}")]
    InvalidEntryJson {
        /// Zero-based chronological entry index.
        entry_index: u64,
        /// Strict entry or result-value failure.
        #[source]
        source: JsonFailure,
    },
    /// One entry operation has invalid strict JSON shape.
    #[error(
        "invalid session-checkpoint operation JSON at entry {entry_index}, operation {operation_index}: {source}"
    )]
    InvalidOperationJson {
        /// Zero-based chronological entry index.
        entry_index: u64,
        /// Zero-based entry-local operation index.
        operation_index: u64,
        /// Strict JSON record failure.
        #[source]
        source: JsonFailure,
    },
    /// The envelope does not identify Breditor's session-checkpoint format.
    #[error("unsupported session-checkpoint format `{found}`; expected `{expected}`")]
    UnsupportedFormat {
        /// Format found in the input.
        found: BoundedDiagnostic,
        /// Format accepted by this codec.
        expected: &'static str,
    },
    /// The envelope uses an unsupported wire version.
    #[error(
        "unsupported session-checkpoint format version {found}; this codec supports {supported}"
    )]
    UnsupportedFormatVersion {
        /// Version found in the input.
        found: u32,
        /// Version accepted by this codec.
        supported: u32,
    },
    /// The embedded normalized history-base checkpoint failed its codec boundary.
    #[error("invalid session-checkpoint history base: {0}")]
    InvalidHistoryBase(#[source] EditorStateCodecError),
    /// The normalized history base carries a nonzero revision.
    #[error("session-checkpoint history-base revision is {actual:?}; expected zero")]
    NonZeroHistoryBaseRevision {
        /// Rejected history-base revision.
        actual: Revision,
    },
    /// A non-operation checkpoint field failed checked reconstruction.
    #[error(transparent)]
    InvalidRecord(#[from] SessionCheckpointRecordError),
    /// History capacity, cursor, entries, and merge continuity are inconsistent.
    #[error(transparent)]
    InvalidTopology(#[from] SessionCheckpointTopologyError),
    /// One host-authoritative semantic resource ceiling was exceeded.
    #[error(transparent)]
    ResourceLimit(#[from] SessionCheckpointResourceLimit),
    /// One entry operation could not pass checked runtime construction.
    #[error(
        "invalid operation at session-checkpoint entry {entry_index}, operation {operation_index}: {source}"
    )]
    InvalidOperation {
        /// Zero-based chronological entry index.
        entry_index: u64,
        /// Zero-based entry-local operation index.
        operation_index: u64,
        /// Checked operation-record failure.
        #[source]
        source: OperationRecordError,
    },
    /// One entry operation violates the codec's active context.
    #[error(
        "operation at session-checkpoint entry {entry_index}, operation {operation_index} failed validation: {source}"
    )]
    OperationValidation {
        /// Zero-based chronological entry index.
        entry_index: u64,
        /// Zero-based entry-local operation index.
        operation_index: u64,
        /// Context-static operation failure.
        #[source]
        source: OperationValidationError,
    },
    /// Replaying one reconstructed history entry failed.
    #[error("could not apply reconstructed session-checkpoint entry: {0}")]
    Apply(#[source] SessionCheckpointApplicationError),
    /// One history entry contains no applied content operation.
    #[error(
        "session-checkpoint entry {entry_index} reconstructed to an unchanged {direction:?} transaction"
    )]
    UnexpectedUnchanged {
        /// Zero-based chronological entry index.
        entry_index: u64,
        /// Half of the bidirectional proof that returned unchanged.
        direction: SessionCheckpointReplayDirection,
    },
    /// Applying an entry filtered at least one unchanged wire operation.
    #[error(
        "session-checkpoint entry {entry_index} operations are noncanonical at index {operation_index}"
    )]
    NonCanonicalForwardOperations {
        /// Zero-based chronological entry index.
        entry_index: u64,
        /// First zero-based entry-local wire index that differs from the applied sequence.
        operation_index: u64,
    },
    /// Replaying the derived inverse sequence filtered or changed one operation.
    #[error(
        "session-checkpoint entry {entry_index} inverse operations are noncanonical at index {operation_index}"
    )]
    NonCanonicalInverseOperations {
        /// Zero-based chronological entry index.
        entry_index: u64,
        /// First zero-based inverse index that differs from the applied sequence.
        operation_index: u64,
    },
    /// Backward replay did not restore the entry's exact source boundary.
    #[error("session-checkpoint entry {entry_index} inverse replay did not restore its source")]
    InverseReplayResultMismatch {
        /// Zero-based chronological entry index.
        entry_index: u64,
    },
    /// A private checked session assembly or encoding invariant failed.
    #[error("session-checkpoint runtime invariant failed: {diagnostic}")]
    RuntimeInvariant {
        /// Bounded diagnostic that retains no editor state or operation payload.
        diagnostic: BoundedDiagnostic,
    },
    /// Serialization of a checked session failed.
    #[error("could not encode session-checkpoint JSON: {0}")]
    Encoding(#[source] JsonFailure),
}

impl SessionCheckpointCodecError {
    /// Returns the stable machine-readable failure category.
    #[must_use]
    pub const fn code(&self) -> CodecErrorCode {
        match self {
            Self::ContextConfigurationMismatch => CodecErrorCode::ContextMismatch,
            Self::InputTooLarge { .. } => CodecErrorCode::InputTooLarge,
            Self::OutputTooLarge { .. } => CodecErrorCode::OutputTooLarge,
            Self::InvalidJson(_)
            | Self::InvalidEntryJson { .. }
            | Self::InvalidOperationJson { .. } => CodecErrorCode::InvalidJson,
            Self::UnsupportedFormat { .. } => CodecErrorCode::UnsupportedFormat,
            Self::UnsupportedFormatVersion { .. } => CodecErrorCode::UnsupportedFormatVersion,
            Self::InvalidHistoryBase(source) => source.code(),
            Self::ResourceLimit(_) => CodecErrorCode::ResourceLimit,
            Self::InvalidOperation { .. } => CodecErrorCode::InvalidOperation,
            Self::InvalidRecord(_)
            | Self::InvalidTopology(_)
            | Self::NonZeroHistoryBaseRevision { .. }
            | Self::Apply(_)
            | Self::UnexpectedUnchanged { .. }
            | Self::NonCanonicalForwardOperations { .. }
            | Self::NonCanonicalInverseOperations { .. }
            | Self::InverseReplayResultMismatch { .. }
            | Self::RuntimeInvariant { .. } => CodecErrorCode::InvalidSessionCheckpoint,
            Self::OperationValidation { .. } => CodecErrorCode::ValidationFailed,
            Self::Encoding(_) => CodecErrorCode::EncodingFailed,
        }
    }
}

#[cfg(test)]
mod tests {
    use crate::{
        codec::{CodecErrorCode, MAX_DIAGNOSTIC_PREVIEW_BYTES},
        state::RevisionError,
        transaction::TransactionApplyError,
    };

    use super::{
        RetainedResourceKind, SessionCheckpointApplicationError,
        SessionCheckpointApplicationErrorCode, SessionCheckpointRecordErrorCode,
        SessionCheckpointReplayDirection, SessionCheckpointResourceLimit,
        SessionCheckpointResourceLimitCode, SessionCheckpointTopologyErrorCode,
    };

    #[test]
    fn stable_subcodes_do_not_depend_on_display_text() {
        assert_eq!(
            SessionCheckpointRecordErrorCode::InvalidCurrentRevision.as_str(),
            "session_checkpoint_record.invalid_current_revision"
        );
        assert_eq!(
            SessionCheckpointTopologyErrorCode::OpenMergeGroupWithRedo.as_str(),
            "session_checkpoint_topology.open_merge_group_with_redo"
        );
        assert_eq!(
            SessionCheckpointApplicationErrorCode::Operation.as_str(),
            "session_checkpoint_application.operation"
        );
        assert_eq!(
            RetainedResourceKind::TextBytes.as_str(),
            "session_checkpoint_resource.retained_text_bytes"
        );
        assert_eq!(
            SessionCheckpointResourceLimit::AggregateForwardOperationsOverflow.code(),
            SessionCheckpointResourceLimitCode::AggregateForwardOperationsOverflow
        );
        assert_eq!(
            SessionCheckpointResourceLimitCode::AggregateForwardOperationsOverflow.as_str(),
            "session_checkpoint_resource.aggregate_forward_operations_overflow"
        );
        assert_eq!(SessionCheckpointReplayDirection::Inverse.as_str(), "inverse");
    }

    #[test]
    fn application_projection_is_bounded_and_drops_the_transaction_error() {
        let source = TransactionApplyError::Revision(RevisionError::Overflow);
        let projected = SessionCheckpointApplicationError::from_transaction(
            7,
            SessionCheckpointReplayDirection::Inverse,
            &source,
        );

        assert_eq!(projected.entry_index(), 7);
        assert_eq!(projected.direction(), SessionCheckpointReplayDirection::Inverse);
        assert_eq!(projected.code(), SessionCheckpointApplicationErrorCode::RevisionOverflow);
        assert_eq!(projected.operation_index(), None);
        assert!(projected.diagnostic().len() <= MAX_DIAGNOSTIC_PREVIEW_BYTES);
        assert_eq!(
            CodecErrorCode::InvalidSessionCheckpoint.as_str(),
            "codec.invalid_session_checkpoint"
        );
    }
}

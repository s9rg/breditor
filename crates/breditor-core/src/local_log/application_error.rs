use std::{error::Error, fmt};

use crate::{
    session::{HistoryReplayError, SessionCommitError},
    transaction::{CommitReplayError, TransactionApplyError},
};

use super::{LocalLogEventError, LocalLogEventErrorCode, LocalLogEventKind};

/// Stable category for a transaction failure while deriving undo or redo.
#[non_exhaustive]
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub enum LocalLogReplayTransactionErrorCode {
    /// Transaction and session contexts use different schemas.
    ContextSchemaMismatch,
    /// Equal schema identity hid different runtime configuration.
    ContextConfigurationMismatch,
    /// The replay request targeted another snapshot.
    StaleSnapshot,
    /// The current snapshot identity was reused for unequal state.
    BaseStateMismatch,
    /// The replay recipe exceeds the active transaction operation limit.
    OperationLimit,
    /// One replay operation failed.
    Operation,
    /// Automatic selection relocation failed.
    SelectionRelocation,
    /// The derived result state failed publication validation.
    InvalidResultState,
    /// The lineage-local editor revision cannot advance.
    RevisionOverflow,
}

impl LocalLogReplayTransactionErrorCode {
    /// Returns the stable namespaced error code.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::ContextSchemaMismatch => "local_log_replay_transaction.context_schema_mismatch",
            Self::ContextConfigurationMismatch => {
                "local_log_replay_transaction.context_configuration_mismatch"
            }
            Self::StaleSnapshot => "local_log_replay_transaction.stale_snapshot",
            Self::BaseStateMismatch => "local_log_replay_transaction.base_state_mismatch",
            Self::OperationLimit => "local_log_replay_transaction.operation_limit",
            Self::Operation => "local_log_replay_transaction.operation",
            Self::SelectionRelocation => "local_log_replay_transaction.selection_relocation",
            Self::InvalidResultState => "local_log_replay_transaction.invalid_result_state",
            Self::RevisionOverflow => "local_log_replay_transaction.revision_overflow",
        }
    }

    pub(super) const fn from_transaction(error: &TransactionApplyError) -> (Self, Option<u64>) {
        match error {
            TransactionApplyError::ContextSchemaMismatch { .. } => {
                (Self::ContextSchemaMismatch, None)
            }
            TransactionApplyError::ContextConfigurationMismatch => {
                (Self::ContextConfigurationMismatch, None)
            }
            TransactionApplyError::StaleSnapshot { .. } => (Self::StaleSnapshot, None),
            TransactionApplyError::BaseStateMismatch { .. } => (Self::BaseStateMismatch, None),
            TransactionApplyError::OperationLimit { .. } => (Self::OperationLimit, None),
            TransactionApplyError::Operation { operation_index, .. } => {
                (Self::Operation, Some(*operation_index))
            }
            TransactionApplyError::SelectionRelocation(_) => (Self::SelectionRelocation, None),
            TransactionApplyError::InvalidResultState(_) => (Self::InvalidResultState, None),
            TransactionApplyError::Revision(_) => (Self::RevisionOverflow, None),
        }
    }
}

/// Stable category for applying one checked local-log event to a session.
#[non_exhaustive]
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub enum LocalLogEventApplicationErrorCode {
    /// The private event classification no longer satisfies its constructor law.
    InvalidEvent,
    /// A commit-bearing event unexpectedly retained no commit.
    RuntimeInvariant,
    /// An ordinary commit targets another snapshot.
    CommitStaleSnapshot,
    /// An ordinary commit reused the current snapshot for unequal state.
    CommitBaseStateMismatch,
    /// The requested undo or redo entry does not exist.
    ReplayUnavailable,
    /// The retained replay boundary belongs to another lineage.
    ReplayBoundaryLineageMismatch,
    /// The retained replay boundary has different document content.
    ReplayBoundaryDocumentMismatch,
    /// Deriving the authoritative undo or redo transaction failed.
    ReplayTransaction,
    /// A retained replay recipe unexpectedly produced no state change.
    ReplayUnexpectedUnchanged,
    /// A derived replay did not restore its retained opposite boundary.
    ReplayResultMismatch,
    /// The embedded logged commit differs from the locally derived replay.
    ReplayCommitMismatch,
    /// The prepared replay became stale before publication.
    PreparedReplayStale,
    /// A close or clear control event had no effect.
    IneffectiveControl,
}

impl LocalLogEventApplicationErrorCode {
    /// Returns the stable namespaced error code.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::InvalidEvent => "local_log_event_application.invalid_event",
            Self::RuntimeInvariant => "local_log_event_application.runtime_invariant",
            Self::CommitStaleSnapshot => "local_log_event_application.commit_stale_snapshot",
            Self::CommitBaseStateMismatch => {
                "local_log_event_application.commit_base_state_mismatch"
            }
            Self::ReplayUnavailable => "local_log_event_application.replay_unavailable",
            Self::ReplayBoundaryLineageMismatch => {
                "local_log_event_application.replay_boundary_lineage_mismatch"
            }
            Self::ReplayBoundaryDocumentMismatch => {
                "local_log_event_application.replay_boundary_document_mismatch"
            }
            Self::ReplayTransaction => "local_log_event_application.replay_transaction",
            Self::ReplayUnexpectedUnchanged => {
                "local_log_event_application.replay_unexpected_unchanged"
            }
            Self::ReplayResultMismatch => "local_log_event_application.replay_result_mismatch",
            Self::ReplayCommitMismatch => "local_log_event_application.replay_commit_mismatch",
            Self::PreparedReplayStale => "local_log_event_application.prepared_replay_stale",
            Self::IneffectiveControl => "local_log_event_application.ineffective_control",
        }
    }
}

/// Payload-free reason one checked event could not apply to a local session.
///
/// This projection deliberately retains neither a commit, editor state,
/// transaction error, operation guard, nor diagnostic derived from document
/// content. Event kind, stable subcodes, and an optional fixed-width operation
/// index are sufficient for deterministic recovery control flow.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct LocalLogEventApplicationError {
    code: LocalLogEventApplicationErrorCode,
    event_kind: LocalLogEventKind,
    event_validation_code: Option<LocalLogEventErrorCode>,
    replay_transaction_code: Option<LocalLogReplayTransactionErrorCode>,
    operation_index: Option<u64>,
}

impl LocalLogEventApplicationError {
    /// Returns the stable event-application category.
    #[must_use]
    pub const fn code(&self) -> LocalLogEventApplicationErrorCode {
        self.code
    }

    /// Returns the event discriminator that failed.
    #[must_use]
    pub const fn event_kind(&self) -> LocalLogEventKind {
        self.event_kind
    }

    /// Returns the private event-classification failure when applicable.
    #[must_use]
    pub const fn event_validation_code(&self) -> Option<LocalLogEventErrorCode> {
        self.event_validation_code
    }

    /// Returns the projected replay-transaction category when applicable.
    #[must_use]
    pub const fn replay_transaction_code(&self) -> Option<LocalLogReplayTransactionErrorCode> {
        self.replay_transaction_code
    }

    /// Returns the zero-based replay-operation index when one operation failed.
    #[must_use]
    pub const fn operation_index(&self) -> Option<u64> {
        self.operation_index
    }

    pub(super) fn invalid_event(error: &LocalLogEventError) -> Self {
        Self::new(error.kind(), LocalLogEventApplicationErrorCode::InvalidEvent)
            .with_event_validation_code(error.code())
    }

    pub(super) const fn runtime_invariant(kind: LocalLogEventKind) -> Self {
        Self::new(kind, LocalLogEventApplicationErrorCode::RuntimeInvariant)
    }

    pub(super) const fn from_commit_error(
        kind: LocalLogEventKind,
        error: &SessionCommitError,
    ) -> Self {
        let code = match error {
            SessionCommitError::StaleSnapshot { .. } => {
                LocalLogEventApplicationErrorCode::CommitStaleSnapshot
            }
            SessionCommitError::BaseStateMismatch { .. } => {
                LocalLogEventApplicationErrorCode::CommitBaseStateMismatch
            }
        };
        Self::new(kind, code)
    }

    pub(super) const fn replay_unavailable(kind: LocalLogEventKind) -> Self {
        Self::new(kind, LocalLogEventApplicationErrorCode::ReplayUnavailable)
    }

    pub(super) fn from_history_error(kind: LocalLogEventKind, error: &HistoryReplayError) -> Self {
        match error {
            HistoryReplayError::Boundary(CommitReplayError::LineageMismatch { .. }) => {
                Self::new(kind, LocalLogEventApplicationErrorCode::ReplayBoundaryLineageMismatch)
            }
            HistoryReplayError::Boundary(CommitReplayError::DocumentMismatch { .. }) => {
                Self::new(kind, LocalLogEventApplicationErrorCode::ReplayBoundaryDocumentMismatch)
            }
            HistoryReplayError::Transaction { source, .. } => {
                let (transaction_code, operation_index) =
                    LocalLogReplayTransactionErrorCode::from_transaction(source);
                Self::new(kind, LocalLogEventApplicationErrorCode::ReplayTransaction)
                    .with_replay_transaction(transaction_code, operation_index)
            }
            HistoryReplayError::UnexpectedUnchanged { .. } => {
                Self::new(kind, LocalLogEventApplicationErrorCode::ReplayUnexpectedUnchanged)
            }
            HistoryReplayError::ResultMismatch { .. } => {
                Self::new(kind, LocalLogEventApplicationErrorCode::ReplayResultMismatch)
            }
        }
    }

    pub(super) const fn replay_commit_mismatch(kind: LocalLogEventKind) -> Self {
        Self::new(kind, LocalLogEventApplicationErrorCode::ReplayCommitMismatch)
    }

    pub(super) const fn prepared_replay_stale(kind: LocalLogEventKind) -> Self {
        Self::new(kind, LocalLogEventApplicationErrorCode::PreparedReplayStale)
    }

    pub(super) const fn ineffective_control(kind: LocalLogEventKind) -> Self {
        Self::new(kind, LocalLogEventApplicationErrorCode::IneffectiveControl)
    }

    const fn new(event_kind: LocalLogEventKind, code: LocalLogEventApplicationErrorCode) -> Self {
        Self {
            code,
            event_kind,
            event_validation_code: None,
            replay_transaction_code: None,
            operation_index: None,
        }
    }

    const fn with_event_validation_code(mut self, code: LocalLogEventErrorCode) -> Self {
        self.event_validation_code = Some(code);
        self
    }

    const fn with_replay_transaction(
        mut self,
        code: LocalLogReplayTransactionErrorCode,
        operation_index: Option<u64>,
    ) -> Self {
        self.replay_transaction_code = Some(code);
        self.operation_index = operation_index;
        self
    }
}

impl fmt::Display for LocalLogEventApplicationError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(formatter, "{} local-log event failed: {}", self.event_kind, self.code.as_str())
    }
}

impl Error for LocalLogEventApplicationError {}

#[cfg(test)]
mod tests {
    use super::{LocalLogEventApplicationErrorCode, LocalLogReplayTransactionErrorCode};

    #[test]
    fn event_application_error_codes_are_stable() {
        let cases = [
            (
                LocalLogEventApplicationErrorCode::InvalidEvent,
                "local_log_event_application.invalid_event",
            ),
            (
                LocalLogEventApplicationErrorCode::RuntimeInvariant,
                "local_log_event_application.runtime_invariant",
            ),
            (
                LocalLogEventApplicationErrorCode::CommitStaleSnapshot,
                "local_log_event_application.commit_stale_snapshot",
            ),
            (
                LocalLogEventApplicationErrorCode::CommitBaseStateMismatch,
                "local_log_event_application.commit_base_state_mismatch",
            ),
            (
                LocalLogEventApplicationErrorCode::ReplayUnavailable,
                "local_log_event_application.replay_unavailable",
            ),
            (
                LocalLogEventApplicationErrorCode::ReplayBoundaryLineageMismatch,
                "local_log_event_application.replay_boundary_lineage_mismatch",
            ),
            (
                LocalLogEventApplicationErrorCode::ReplayBoundaryDocumentMismatch,
                "local_log_event_application.replay_boundary_document_mismatch",
            ),
            (
                LocalLogEventApplicationErrorCode::ReplayTransaction,
                "local_log_event_application.replay_transaction",
            ),
            (
                LocalLogEventApplicationErrorCode::ReplayUnexpectedUnchanged,
                "local_log_event_application.replay_unexpected_unchanged",
            ),
            (
                LocalLogEventApplicationErrorCode::ReplayResultMismatch,
                "local_log_event_application.replay_result_mismatch",
            ),
            (
                LocalLogEventApplicationErrorCode::ReplayCommitMismatch,
                "local_log_event_application.replay_commit_mismatch",
            ),
            (
                LocalLogEventApplicationErrorCode::PreparedReplayStale,
                "local_log_event_application.prepared_replay_stale",
            ),
            (
                LocalLogEventApplicationErrorCode::IneffectiveControl,
                "local_log_event_application.ineffective_control",
            ),
        ];
        for (code, expected) in cases {
            assert_eq!(code.as_str(), expected);
        }
    }

    #[test]
    fn replay_transaction_error_codes_are_stable() {
        let cases = [
            (
                LocalLogReplayTransactionErrorCode::ContextSchemaMismatch,
                "local_log_replay_transaction.context_schema_mismatch",
            ),
            (
                LocalLogReplayTransactionErrorCode::ContextConfigurationMismatch,
                "local_log_replay_transaction.context_configuration_mismatch",
            ),
            (
                LocalLogReplayTransactionErrorCode::StaleSnapshot,
                "local_log_replay_transaction.stale_snapshot",
            ),
            (
                LocalLogReplayTransactionErrorCode::BaseStateMismatch,
                "local_log_replay_transaction.base_state_mismatch",
            ),
            (
                LocalLogReplayTransactionErrorCode::OperationLimit,
                "local_log_replay_transaction.operation_limit",
            ),
            (
                LocalLogReplayTransactionErrorCode::Operation,
                "local_log_replay_transaction.operation",
            ),
            (
                LocalLogReplayTransactionErrorCode::SelectionRelocation,
                "local_log_replay_transaction.selection_relocation",
            ),
            (
                LocalLogReplayTransactionErrorCode::InvalidResultState,
                "local_log_replay_transaction.invalid_result_state",
            ),
            (
                LocalLogReplayTransactionErrorCode::RevisionOverflow,
                "local_log_replay_transaction.revision_overflow",
            ),
        ];
        for (code, expected) in cases {
            assert_eq!(code.as_str(), expected);
        }
    }
}

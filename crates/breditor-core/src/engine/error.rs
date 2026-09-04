use std::fmt;

use thiserror::Error;

use crate::{
    action::{ActionExecutionError, ActionPrepareError},
    session::HistoryReplayError,
    state::SnapshotId,
    transaction::TransactionApplyError,
};

/// Stable machine-readable category for [`EditorEngineError`].
#[non_exhaustive]
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub enum EditorEngineErrorCode {
    /// A delayed command came from another live engine instance.
    StaleEngine,
    /// A delayed command named a snapshot other than the engine's current one.
    StaleSnapshot,
    /// A delayed command named an obsolete history observation.
    StaleHistory,
    /// An action could not be evaluated and preflighted.
    ActionPreparation,
    /// A prepared action could not be published.
    ActionExecution,
    /// A host selection could not be validated and published.
    SelectionUpdate,
    /// An available undo or redo transition could not replay.
    HistoryReplay,
}

impl EditorEngineErrorCode {
    /// Returns the stable namespaced error code.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::StaleEngine => "editor_engine.stale_engine",
            Self::StaleSnapshot => "editor_engine.stale_snapshot",
            Self::StaleHistory => "editor_engine.stale_history",
            Self::ActionPreparation => "editor_engine.action_preparation",
            Self::ActionExecution => "editor_engine.action_execution",
            Self::SelectionUpdate => "editor_engine.selection_update",
            Self::HistoryReplay => "editor_engine.history_replay",
        }
    }
}

/// Why one guarded [`super::EditorEngine`] command did not publish.
///
/// Every variant is atomic: the engine's state and history are unchanged. The
/// custom [`fmt::Debug`] implementation retains categories and snapshot IDs but
/// never formats engine identity or document-bearing transaction/history sources.
#[non_exhaustive]
#[derive(Clone, Eq, Error, PartialEq)]
pub enum EditorEngineError {
    /// The observation belongs to another engine instance.
    #[error("engine observation belongs to another engine instance")]
    StaleEngine,
    /// The caller observed a different engine snapshot.
    #[error("engine expects snapshot {expected:?}, got {actual:?}")]
    StaleSnapshot {
        /// Engine's authoritative current snapshot.
        expected: SnapshotId,
        /// Snapshot supplied by the caller.
        actual: SnapshotId,
    },
    /// The document snapshot matches but hidden history changed.
    #[error("engine history observation is stale")]
    StaleHistory,
    /// Action evaluation or transaction preflight failed.
    #[error("action preparation failed: {source}")]
    ActionPreparation {
        /// Exact typed preparation failure.
        source: ActionPrepareError,
    },
    /// The synchronously prepared action could not publish.
    #[error("prepared action publication failed: {source}")]
    ActionExecution {
        /// Exact typed publication failure.
        source: ActionExecutionError,
    },
    /// The explicit selection transition failed validation.
    #[error("selection update failed: {source}")]
    SelectionUpdate {
        /// Exact atomic transaction failure.
        source: TransactionApplyError,
    },
    /// An available history entry failed atomic replay.
    #[error("history replay failed: {source}")]
    HistoryReplay {
        /// Exact typed replay failure.
        source: HistoryReplayError,
    },
}

impl EditorEngineError {
    /// Returns the stable machine-readable error category.
    #[must_use]
    pub const fn code(&self) -> EditorEngineErrorCode {
        match self {
            Self::StaleEngine => EditorEngineErrorCode::StaleEngine,
            Self::StaleSnapshot { .. } => EditorEngineErrorCode::StaleSnapshot,
            Self::StaleHistory => EditorEngineErrorCode::StaleHistory,
            Self::ActionPreparation { .. } => EditorEngineErrorCode::ActionPreparation,
            Self::ActionExecution { .. } => EditorEngineErrorCode::ActionExecution,
            Self::SelectionUpdate { .. } => EditorEngineErrorCode::SelectionUpdate,
            Self::HistoryReplay { .. } => EditorEngineErrorCode::HistoryReplay,
        }
    }
}

impl fmt::Debug for EditorEngineError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::StaleEngine => formatter.write_str("StaleEngine"),
            Self::StaleSnapshot { expected, actual } => formatter
                .debug_struct("StaleSnapshot")
                .field("expected", expected)
                .field("actual", actual)
                .finish(),
            Self::StaleHistory => formatter.write_str("StaleHistory"),
            Self::ActionPreparation { source } => {
                formatter.debug_struct("ActionPreparation").field("source", source).finish()
            }
            Self::ActionExecution { .. } => formatter
                .debug_struct("ActionExecution")
                .field("source", &"<redacted>")
                .finish_non_exhaustive(),
            Self::SelectionUpdate { .. } => formatter
                .debug_struct("SelectionUpdate")
                .field("source", &"<redacted>")
                .finish_non_exhaustive(),
            Self::HistoryReplay { .. } => formatter
                .debug_struct("HistoryReplay")
                .field("source", &"<redacted>")
                .finish_non_exhaustive(),
        }
    }
}

impl From<ActionPrepareError> for EditorEngineError {
    fn from(source: ActionPrepareError) -> Self {
        Self::ActionPreparation { source }
    }
}

impl From<ActionExecutionError> for EditorEngineError {
    fn from(source: ActionExecutionError) -> Self {
        Self::ActionExecution { source }
    }
}

impl From<TransactionApplyError> for EditorEngineError {
    fn from(source: TransactionApplyError) -> Self {
        Self::SelectionUpdate { source }
    }
}

impl From<HistoryReplayError> for EditorEngineError {
    fn from(source: HistoryReplayError) -> Self {
        Self::HistoryReplay { source }
    }
}

#[cfg(test)]
mod tests {
    use super::EditorEngineErrorCode;

    #[test]
    fn error_code_strings_are_stable_and_namespaced() {
        let cases = [
            (EditorEngineErrorCode::StaleEngine, "editor_engine.stale_engine"),
            (EditorEngineErrorCode::StaleSnapshot, "editor_engine.stale_snapshot"),
            (EditorEngineErrorCode::StaleHistory, "editor_engine.stale_history"),
            (EditorEngineErrorCode::ActionPreparation, "editor_engine.action_preparation"),
            (EditorEngineErrorCode::ActionExecution, "editor_engine.action_execution"),
            (EditorEngineErrorCode::SelectionUpdate, "editor_engine.selection_update"),
            (EditorEngineErrorCode::HistoryReplay, "editor_engine.history_replay"),
        ];

        for (code, expected) in cases {
            assert_eq!(code.as_str(), expected);
        }
    }
}

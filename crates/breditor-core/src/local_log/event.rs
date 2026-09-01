use std::fmt;

use thiserror::Error;

use crate::transaction::{Commit, HistoryIntent};

/// Stable discriminator for one ordered local-log event.
///
/// The returned lower-camel-case string is a stable runtime contract. This
/// value layer does not itself define or enable a serialization format.
#[non_exhaustive]
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub enum LocalLogEventKind {
    /// Publish one ordinary committed transaction.
    Commit,
    /// Publish one history undo transition.
    Undo,
    /// Publish one history redo transition.
    Redo,
    /// Close the current history merge group without changing editor state.
    CloseHistoryGroup,
    /// Clear retained linear history without changing editor state.
    ClearHistory,
}

impl LocalLogEventKind {
    /// Returns the stable lower-camel-case event name.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Commit => "commit",
            Self::Undo => "undo",
            Self::Redo => "redo",
            Self::CloseHistoryGroup => "closeHistoryGroup",
            Self::ClearHistory => "clearHistory",
        }
    }
}

impl fmt::Display for LocalLogEventKind {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(self.as_str())
    }
}

/// One invariant-bearing state or history-control event in an ordered local log.
///
/// The private representation prevents callers from labeling an arbitrary
/// commit as an undo or redo. Commit-bearing events retain the complete
/// immutable transition so a later persistence boundary can encode its proof
/// inputs. History-control events are explicit rather than inferred from
/// sequence gaps.
#[derive(Eq, PartialEq)]
pub struct LocalLogEvent(LocalLogEventValue);

#[derive(Eq, PartialEq)]
enum LocalLogEventValue {
    Commit(Commit),
    Undo(Commit),
    Redo(Commit),
    CloseHistoryGroup,
    ClearHistory,
}

impl LocalLogEvent {
    /// Creates an ordinary commit event from any successfully proved commit.
    #[must_use]
    pub const fn commit(commit: Commit) -> Self {
        Self(LocalLogEventValue::Commit(commit))
    }

    /// Validates and creates an undo event.
    ///
    /// # Errors
    ///
    /// Returns [`LocalLogEventError`] unless the commit has at least one
    /// applied forward operation, exact action `breditor/undo`, and
    /// [`HistoryIntent::Ignore`]. The error never retains the rejected commit.
    pub fn try_undo(commit: Commit) -> Result<Self, LocalLogEventError> {
        validate_replay_commit(&commit, LocalLogEventKind::Undo, "breditor/undo")?;
        Ok(Self(LocalLogEventValue::Undo(commit)))
    }

    /// Validates and creates a redo event.
    ///
    /// # Errors
    ///
    /// Returns [`LocalLogEventError`] unless the commit has at least one
    /// applied forward operation, exact action `breditor/redo`, and
    /// [`HistoryIntent::Ignore`]. The error never retains the rejected commit.
    pub fn try_redo(commit: Commit) -> Result<Self, LocalLogEventError> {
        validate_replay_commit(&commit, LocalLogEventKind::Redo, "breditor/redo")?;
        Ok(Self(LocalLogEventValue::Redo(commit)))
    }

    /// Creates an explicit close-history-group event.
    #[must_use]
    pub const fn close_history_group() -> Self {
        Self(LocalLogEventValue::CloseHistoryGroup)
    }

    /// Creates an explicit clear-history event.
    #[must_use]
    pub const fn clear_history() -> Self {
        Self(LocalLogEventValue::ClearHistory)
    }

    /// Returns the stable event discriminator.
    #[must_use]
    pub const fn kind(&self) -> LocalLogEventKind {
        match &self.0 {
            LocalLogEventValue::Commit(_) => LocalLogEventKind::Commit,
            LocalLogEventValue::Undo(_) => LocalLogEventKind::Undo,
            LocalLogEventValue::Redo(_) => LocalLogEventKind::Redo,
            LocalLogEventValue::CloseHistoryGroup => LocalLogEventKind::CloseHistoryGroup,
            LocalLogEventValue::ClearHistory => LocalLogEventKind::ClearHistory,
        }
    }

    /// Returns the retained commit for a commit-bearing event.
    #[must_use]
    pub const fn as_commit(&self) -> Option<&Commit> {
        match &self.0 {
            LocalLogEventValue::Commit(commit)
            | LocalLogEventValue::Undo(commit)
            | LocalLogEventValue::Redo(commit) => Some(commit),
            LocalLogEventValue::CloseHistoryGroup | LocalLogEventValue::ClearHistory => None,
        }
    }

    /// Rechecks the private event classification without consuming its commit.
    pub(crate) fn validate(&self) -> Result<(), LocalLogEventError> {
        match &self.0 {
            LocalLogEventValue::Undo(commit) => {
                validate_replay_commit(commit, LocalLogEventKind::Undo, "breditor/undo")
            }
            LocalLogEventValue::Redo(commit) => {
                validate_replay_commit(commit, LocalLogEventKind::Redo, "breditor/redo")
            }
            LocalLogEventValue::Commit(_)
            | LocalLogEventValue::CloseHistoryGroup
            | LocalLogEventValue::ClearHistory => Ok(()),
        }
    }

    /// Compares the exact durable V1 value used by one replay binding.
    pub(crate) fn same_durable_value(&self, other: &Self) -> bool {
        match (&self.0, &other.0) {
            (LocalLogEventValue::Commit(commit), LocalLogEventValue::Commit(other))
            | (LocalLogEventValue::Undo(commit), LocalLogEventValue::Undo(other))
            | (LocalLogEventValue::Redo(commit), LocalLogEventValue::Redo(other)) => {
                commit.same_checkpoint_proof(other)
            }
            (LocalLogEventValue::CloseHistoryGroup, LocalLogEventValue::CloseHistoryGroup)
            | (LocalLogEventValue::ClearHistory, LocalLogEventValue::ClearHistory) => true,
            (
                LocalLogEventValue::Commit(_)
                | LocalLogEventValue::Undo(_)
                | LocalLogEventValue::Redo(_)
                | LocalLogEventValue::CloseHistoryGroup
                | LocalLogEventValue::ClearHistory,
                _,
            ) => false,
        }
    }
}

impl fmt::Debug for LocalLogEvent {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.debug_struct("LocalLogEvent").field("kind", &self.kind()).finish_non_exhaustive()
    }
}

/// Stable machine-readable category for [`LocalLogEventError`].
#[non_exhaustive]
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub enum LocalLogEventErrorCode {
    /// A replay event has no applied forward operation.
    EmptyForwardOperations,
    /// Replay metadata has no action or the wrong action.
    UnexpectedAction,
    /// Replay metadata can participate in ordinary history.
    UnexpectedHistoryIntent,
}

impl LocalLogEventErrorCode {
    /// Returns the stable namespaced error code.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::EmptyForwardOperations => "local_log_event.empty_forward_operations",
            Self::UnexpectedAction => "local_log_event.unexpected_action",
            Self::UnexpectedHistoryIntent => "local_log_event.unexpected_history_intent",
        }
    }
}

/// Why a commit cannot be classified as a local history-replay event.
///
/// Variants retain only the requested event kind and stable expected action;
/// they never retain a rejected [`Commit`] or any document-bearing error.
#[non_exhaustive]
#[derive(Clone, Copy, Debug, Eq, Error, PartialEq)]
pub enum LocalLogEventError {
    /// A history replay commit contains no applied document operation.
    #[error("{kind} event commit has no applied forward operation")]
    EmptyForwardOperations {
        /// Requested replay event kind.
        kind: LocalLogEventKind,
    },
    /// The replay commit has no action or a different action.
    #[error("{kind} event commit must have exact action `{expected}`")]
    UnexpectedAction {
        /// Requested replay event kind.
        kind: LocalLogEventKind,
        /// Required stable action name.
        expected: &'static str,
    },
    /// The replay commit can participate in ordinary user history.
    #[error("{kind} event commit must use ignore history intent")]
    UnexpectedHistoryIntent {
        /// Requested replay event kind.
        kind: LocalLogEventKind,
    },
}

impl LocalLogEventError {
    /// Returns the stable machine-readable error category.
    #[must_use]
    pub const fn code(&self) -> LocalLogEventErrorCode {
        match self {
            Self::EmptyForwardOperations { .. } => LocalLogEventErrorCode::EmptyForwardOperations,
            Self::UnexpectedAction { .. } => LocalLogEventErrorCode::UnexpectedAction,
            Self::UnexpectedHistoryIntent { .. } => LocalLogEventErrorCode::UnexpectedHistoryIntent,
        }
    }

    /// Returns the replay event kind that failed validation.
    #[must_use]
    pub const fn kind(&self) -> LocalLogEventKind {
        match self {
            Self::EmptyForwardOperations { kind }
            | Self::UnexpectedAction { kind, .. }
            | Self::UnexpectedHistoryIntent { kind } => *kind,
        }
    }
}

fn validate_replay_commit(
    commit: &Commit,
    kind: LocalLogEventKind,
    expected_action: &'static str,
) -> Result<(), LocalLogEventError> {
    if commit.forward_operations().is_empty() {
        return Err(LocalLogEventError::EmptyForwardOperations { kind });
    }
    if commit.metadata().action().map(crate::identity::QualifiedName::as_str)
        != Some(expected_action)
    {
        return Err(LocalLogEventError::UnexpectedAction { kind, expected: expected_action });
    }
    if commit.metadata().history() != &HistoryIntent::Ignore {
        return Err(LocalLogEventError::UnexpectedHistoryIntent { kind });
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{LocalLogEvent, LocalLogEventErrorCode, LocalLogEventKind};

    #[test]
    fn control_event_kinds_have_stable_strings_and_no_commit() {
        let cases = [
            (
                LocalLogEvent::close_history_group(),
                LocalLogEventKind::CloseHistoryGroup,
                "closeHistoryGroup",
            ),
            (LocalLogEvent::clear_history(), LocalLogEventKind::ClearHistory, "clearHistory"),
        ];

        for (event, expected_kind, expected_name) in cases {
            assert_eq!(event.kind(), expected_kind);
            assert_eq!(event.kind().as_str(), expected_name);
            assert_eq!(event.kind().to_string(), expected_name);
            assert_eq!(event.as_commit(), None);
        }
    }

    #[test]
    fn debug_output_exposes_only_the_event_kind() {
        let event = LocalLogEvent::clear_history();

        assert_eq!(format!("{event:?}"), "LocalLogEvent { kind: ClearHistory, .. }");
    }

    #[test]
    fn event_error_codes_are_stable() {
        assert_eq!(
            LocalLogEventErrorCode::EmptyForwardOperations.as_str(),
            "local_log_event.empty_forward_operations"
        );
        assert_eq!(
            LocalLogEventErrorCode::UnexpectedAction.as_str(),
            "local_log_event.unexpected_action"
        );
        assert_eq!(
            LocalLogEventErrorCode::UnexpectedHistoryIntent.as_str(),
            "local_log_event.unexpected_history_intent"
        );
    }
}

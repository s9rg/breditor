use std::fmt;

use crate::{
    local_log::LocalLogEvent,
    session::{ExecutedRedo, ExecutedUndo},
    transaction::Commit,
};

use super::{EditorEngineLocalLogEvent, EditorEngineObservation};

/// Stable semantic kind of one effective guarded engine mutation.
///
/// The lower-camel-case spelling is a stable runtime discriminator. This is a
/// renderer/controller event kind, not a durable local-log record kind.
#[non_exhaustive]
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub enum EditorEngineEventKind {
    /// One registered action published a commit.
    Action,
    /// One host-observed selection change published a state-only commit.
    Selection,
    /// One undo entry replayed.
    Undo,
    /// One redo entry replayed.
    Redo,
    /// An open history merge group was closed.
    CloseHistoryGroup,
    /// Retained undo/redo history was cleared.
    ClearHistory,
}

impl EditorEngineEventKind {
    /// Returns the stable lower-camel-case event name.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Action => "action",
            Self::Selection => "selection",
            Self::Undo => "undo",
            Self::Redo => "redo",
            Self::CloseHistoryGroup => "closeHistoryGroup",
            Self::ClearHistory => "clearHistory",
        }
    }
}

impl fmt::Display for EditorEngineEventKind {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(self.as_str())
    }
}

/// Sealed result of one effective guarded engine mutation.
///
/// Private construction keeps action, selection, undo, redo, and history-only
/// control results distinct at the host boundary. Commit-bearing events own the
/// exact renderer transition but expose it only by reference, so a caller
/// cannot directly move an undo result into [`LocalLogEvent::commit`]. This is
/// an accidental-misuse guard, not an authorization or provenance boundary:
/// public codecs can copy a borrowed commit. Consuming conversion through
/// [`Self::into_local_log_event`] preserves the sealed classification without a
/// fallible post-publication replay check. Creation of an identity-bearing
/// [`crate::local_log::LocalLogEntry`] still requires a later atomic
/// coordinator.
///
/// Event construction is not part of the public API:
///
/// ```compile_fail
/// use breditor_core::engine::{EditorEngineEvent, EditorEngineObservation};
///
/// fn cannot_forge_kind(observation: EditorEngineObservation) {
///     let _ = EditorEngineEvent::close_history_group(observation);
/// }
/// ```
#[must_use = "an engine event must be rendered, observed, or discarded explicitly"]
#[derive(Eq, PartialEq)]
pub struct EditorEngineEvent {
    value: EditorEngineEventValue,
    observation: EditorEngineObservation,
}

#[derive(Eq, PartialEq)]
enum EditorEngineEventValue {
    Action(Box<Commit>),
    Selection(Box<Commit>),
    Undo(ExecutedUndo),
    Redo(ExecutedRedo),
    CloseHistoryGroup,
    ClearHistory,
}

impl EditorEngineEvent {
    pub(super) const fn action(commit: Box<Commit>, observation: EditorEngineObservation) -> Self {
        Self { value: EditorEngineEventValue::Action(commit), observation }
    }

    pub(super) const fn selection(
        commit: Box<Commit>,
        observation: EditorEngineObservation,
    ) -> Self {
        Self { value: EditorEngineEventValue::Selection(commit), observation }
    }

    pub(super) const fn undo(replay: ExecutedUndo, observation: EditorEngineObservation) -> Self {
        Self { value: EditorEngineEventValue::Undo(replay), observation }
    }

    pub(super) const fn redo(replay: ExecutedRedo, observation: EditorEngineObservation) -> Self {
        Self { value: EditorEngineEventValue::Redo(replay), observation }
    }

    pub(super) const fn close_history_group(observation: EditorEngineObservation) -> Self {
        Self { value: EditorEngineEventValue::CloseHistoryGroup, observation }
    }

    pub(super) const fn clear_history(observation: EditorEngineObservation) -> Self {
        Self { value: EditorEngineEventValue::ClearHistory, observation }
    }

    /// Returns the sealed semantic mutation kind.
    #[must_use]
    pub const fn kind(&self) -> EditorEngineEventKind {
        match &self.value {
            EditorEngineEventValue::Action(_) => EditorEngineEventKind::Action,
            EditorEngineEventValue::Selection(_) => EditorEngineEventKind::Selection,
            EditorEngineEventValue::Undo(_) => EditorEngineEventKind::Undo,
            EditorEngineEventValue::Redo(_) => EditorEngineEventKind::Redo,
            EditorEngineEventValue::CloseHistoryGroup => EditorEngineEventKind::CloseHistoryGroup,
            EditorEngineEventValue::ClearHistory => EditorEngineEventKind::ClearHistory,
        }
    }

    /// Returns the exact renderer-facing transition for a commit-bearing event.
    #[must_use]
    pub const fn commit(&self) -> Option<&Commit> {
        match &self.value {
            EditorEngineEventValue::Action(commit) | EditorEngineEventValue::Selection(commit) => {
                Some(commit)
            }
            EditorEngineEventValue::Undo(replay) => Some(replay.commit()),
            EditorEngineEventValue::Redo(replay) => Some(replay.commit()),
            EditorEngineEventValue::CloseHistoryGroup | EditorEngineEventValue::ClearHistory => {
                None
            }
        }
    }

    /// Returns the complete engine observation after the mutation.
    #[must_use]
    pub const fn observation(&self) -> &EditorEngineObservation {
        &self.observation
    }

    /// Consumes this sealed mutation into a non-lossy local replay projection.
    ///
    /// Action and selection events both become ordinary commit events. Undo,
    /// redo, close-group, and clear-history preserve their exact semantic
    /// classification. The conversion is infallible because callers cannot
    /// construct an [`EditorEngineEvent`] or select its private value variant.
    ///
    /// The source engine kind and successor observation remain attached to the
    /// local event. The result is still not append-ready: its durable schema
    /// binding and session, log, sequence, and replay identities must be supplied
    /// by a future coordinator.
    pub fn into_local_log_event(self) -> EditorEngineLocalLogEvent {
        let source_kind = self.kind();
        let Self { value, observation } = self;
        let event = match value {
            EditorEngineEventValue::Action(commit) | EditorEngineEventValue::Selection(commit) => {
                LocalLogEvent::commit(*commit)
            }
            EditorEngineEventValue::Undo(replay) => LocalLogEvent::undo_from_engine(replay),
            EditorEngineEventValue::Redo(replay) => LocalLogEvent::redo_from_engine(replay),
            EditorEngineEventValue::CloseHistoryGroup => LocalLogEvent::close_history_group(),
            EditorEngineEventValue::ClearHistory => LocalLogEvent::clear_history(),
        };
        EditorEngineLocalLogEvent::new(source_kind, event, observation)
    }
}

impl fmt::Debug for EditorEngineEvent {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("EditorEngineEvent")
            .field("kind", &self.kind())
            .field("observation", &self.observation)
            .field("has_commit", &self.commit().is_some())
            .finish_non_exhaustive()
    }
}

#[cfg(test)]
mod tests {
    use super::EditorEngineEventKind;

    #[test]
    fn event_kind_strings_are_stable() {
        let cases = [
            (EditorEngineEventKind::Action, "action"),
            (EditorEngineEventKind::Selection, "selection"),
            (EditorEngineEventKind::Undo, "undo"),
            (EditorEngineEventKind::Redo, "redo"),
            (EditorEngineEventKind::CloseHistoryGroup, "closeHistoryGroup"),
            (EditorEngineEventKind::ClearHistory, "clearHistory"),
        ];

        for (kind, expected) in cases {
            assert_eq!(kind.as_str(), expected);
            assert_eq!(kind.to_string(), expected);
        }
    }
}

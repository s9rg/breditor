use std::fmt;

use crate::local_log::LocalLogEvent;

use super::{EditorEngineEventKind, EditorEngineObservation};

/// Non-lossy normalization of one sealed engine mutation for local replay.
///
/// The source kind remains distinct even when multiple engine events share one
/// local-log representation: both action and selection events normalize to a
/// [`crate::local_log::LocalLogEventKind::Commit`]. The successor observation travels with the
/// event so a controller does not need to copy it before normalization.
///
/// This value is deliberately not append-ready. A persistence coordinator must
/// still supply the durable schema binding and reserve session, log, sequence,
/// and replay identities before creating a [`crate::local_log::LocalLogEntry`].
#[must_use = "a normalized engine event must be observed, persisted, or discarded explicitly"]
#[derive(Eq, PartialEq)]
pub struct EditorEngineLocalLogEvent {
    source_kind: EditorEngineEventKind,
    event: LocalLogEvent,
    observation: EditorEngineObservation,
}

impl EditorEngineLocalLogEvent {
    pub(super) const fn new(
        source_kind: EditorEngineEventKind,
        event: LocalLogEvent,
        observation: EditorEngineObservation,
    ) -> Self {
        Self { source_kind, event, observation }
    }

    /// Returns the exact engine event kind before normalization.
    #[must_use]
    pub const fn source_kind(&self) -> EditorEngineEventKind {
        self.source_kind
    }

    /// Returns the invariant-bearing local replay event.
    #[must_use]
    pub const fn event(&self) -> &LocalLogEvent {
        &self.event
    }

    /// Returns the complete engine observation after the mutation.
    #[must_use]
    pub const fn observation(&self) -> &EditorEngineObservation {
        &self.observation
    }

    /// Consumes the normalization into every retained component.
    ///
    /// Returning the source kind explicitly prevents an action and a selection
    /// from becoming indistinguishable merely because both use a commit record.
    #[must_use]
    pub fn into_parts(self) -> (EditorEngineEventKind, LocalLogEvent, EditorEngineObservation) {
        (self.source_kind, self.event, self.observation)
    }
}

impl fmt::Debug for EditorEngineLocalLogEvent {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("EditorEngineLocalLogEvent")
            .field("source_kind", &self.source_kind)
            .field("local_log_kind", &self.event.kind())
            .field("observation", &self.observation)
            .finish_non_exhaustive()
    }
}

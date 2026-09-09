use std::fmt;

use crate::action::routing::{IntentBinding, IntentFallThrough, IntentId};

use super::{EditorEngineEvent, EditorEngineObservation, EditorIntentOutcome};

/// A committed semantic intent together with its complete routing provenance.
///
/// The engine event owns the published commit and successor observation. The
/// routed intent, selected binding, and ordered disabled fallthroughs remain
/// attached rather than being discarded during conversion to an engine event.
#[must_use = "a committed intent event must be rendered, observed, or discarded explicitly"]
#[derive(Eq, PartialEq)]
pub struct EditorCommittedIntentEvent {
    intent: IntentId,
    binding: IntentBinding,
    fallthroughs: Box<[IntentFallThrough]>,
    event: EditorEngineEvent,
}

impl EditorCommittedIntentEvent {
    pub(super) const fn new(
        intent: IntentId,
        binding: IntentBinding,
        fallthroughs: Box<[IntentFallThrough]>,
        event: EditorEngineEvent,
    ) -> Self {
        Self { intent, binding, fallthroughs, event }
    }

    /// Returns the routed semantic intent.
    #[must_use]
    pub const fn intent_id(&self) -> &IntentId {
        &self.intent
    }

    /// Returns the exact binding that selected the committed action.
    #[must_use]
    pub const fn binding(&self) -> &IntentBinding {
        &self.binding
    }

    /// Returns earlier disabled candidates in priority evaluation order.
    #[must_use]
    pub const fn fallthroughs(&self) -> &[IntentFallThrough] {
        &self.fallthroughs
    }

    /// Returns the sealed action event produced by the selected action.
    pub const fn event(&self) -> &EditorEngineEvent {
        &self.event
    }

    /// Returns the authoritative observation after publication.
    #[must_use]
    pub const fn observation(&self) -> &EditorEngineObservation {
        self.event.observation()
    }

    /// Consumes the value without losing routing or publication provenance.
    pub fn into_parts(
        self,
    ) -> (IntentId, IntentBinding, Box<[IntentFallThrough]>, EditorEngineEvent) {
        (self.intent, self.binding, self.fallthroughs, self.event)
    }
}

impl fmt::Debug for EditorCommittedIntentEvent {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("EditorCommittedIntentEvent")
            .field("intent", &self.intent)
            .field("binding", &self.binding)
            .field("fallthroughs", &self.fallthroughs)
            .field("event", &self.event)
            .finish_non_exhaustive()
    }
}

/// Non-lossy projection of one guarded semantic-intent outcome.
///
/// A committed result separates the published event from its routing receipt
/// without dropping either. Blocked and unhandled results retain the original
/// [`EditorIntentOutcome`] in full, including their unchanged authoritative
/// observation.
#[must_use = "an intent event outcome must be inspected or discarded explicitly"]
#[derive(Eq, PartialEq)]
pub enum EditorIntentEventOutcome {
    /// One selected action published a commit.
    Committed(EditorCommittedIntentEvent),
    /// Routing blocked or exhausted without changing the engine.
    Unchanged(EditorIntentOutcome),
}

impl EditorIntentEventOutcome {
    /// Returns the committed result, when publication occurred.
    #[must_use]
    pub const fn committed(&self) -> Option<&EditorCommittedIntentEvent> {
        match self {
            Self::Committed(committed) => Some(committed),
            Self::Unchanged(_) => None,
        }
    }

    /// Returns the original blocked or unhandled outcome.
    #[must_use]
    pub const fn unchanged(&self) -> Option<&EditorIntentOutcome> {
        match self {
            Self::Unchanged(unchanged) => Some(unchanged),
            Self::Committed(_) => None,
        }
    }

    /// Returns the authoritative observation after the invocation.
    #[must_use]
    pub const fn observation(&self) -> &EditorEngineObservation {
        match self {
            Self::Committed(committed) => committed.observation(),
            Self::Unchanged(unchanged) => unchanged.observation(),
        }
    }
}

impl fmt::Debug for EditorIntentEventOutcome {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Committed(committed) => {
                formatter.debug_tuple("Committed").field(committed).finish()
            }
            Self::Unchanged(unchanged) => {
                formatter.debug_tuple("Unchanged").field(unchanged).finish()
            }
        }
    }
}

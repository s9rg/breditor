use std::fmt;

use crate::action::{ActionId, ActionStateIndicator, DisabledReason};

use super::{EditorEngineEvent, EditorEngineObservation};

/// Expected result of synchronously evaluating and executing one action.
///
/// A disabled action is ordinary control-flow data rather than an error. An
/// enabled action always returns the sealed action event published by the engine.
#[must_use = "an action outcome must be inspected or discarded explicitly"]
#[derive(Eq, PartialEq)]
pub enum EditorActionOutcome {
    /// The action published one sealed action event.
    Committed(EditorEngineEvent),
    /// The action was expectedly unavailable at the guarded snapshot.
    Disabled(EditorDisabledAction),
}

impl EditorActionOutcome {
    /// Returns the published action event, when the action was enabled.
    #[must_use]
    pub const fn event(&self) -> Option<&EditorEngineEvent> {
        match self {
            Self::Committed(event) => Some(event),
            Self::Disabled(_) => None,
        }
    }

    /// Returns the disabled result, when the action was unavailable.
    #[must_use]
    pub const fn disabled(&self) -> Option<&EditorDisabledAction> {
        match self {
            Self::Disabled(disabled) => Some(disabled),
            Self::Committed(_) => None,
        }
    }

    /// Consumes the outcome and returns the sealed action event, when present.
    #[must_use]
    pub fn into_event(self) -> Option<EditorEngineEvent> {
        match self {
            Self::Committed(event) => Some(event),
            Self::Disabled(_) => None,
        }
    }
}

impl fmt::Debug for EditorActionOutcome {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Committed(event) => {
                formatter.debug_struct("Committed").field("event", event).finish_non_exhaustive()
            }
            Self::Disabled(disabled) => formatter.debug_tuple("Disabled").field(disabled).finish(),
        }
    }
}

/// Small, payload-redacting projection of one disabled action preparation.
///
/// The complete immutable base state retained during preparation is dropped at
/// the engine boundary. A host receives only the stable action identity,
/// expected disabled reason, and coherent toolbar-facing indicator.
#[derive(Clone, Eq, PartialEq)]
pub struct EditorDisabledAction {
    action: ActionId,
    reason: DisabledReason,
    indicator: ActionStateIndicator,
    observation: EditorEngineObservation,
}

impl EditorDisabledAction {
    pub(super) const fn new(
        action: ActionId,
        reason: DisabledReason,
        indicator: ActionStateIndicator,
        observation: EditorEngineObservation,
    ) -> Self {
        Self { action, reason, indicator, observation }
    }

    /// Returns the action that was evaluated.
    #[must_use]
    pub const fn action(&self) -> &ActionId {
        &self.action
    }

    /// Returns the stable expected-unavailability reason.
    #[must_use]
    pub const fn reason(&self) -> &DisabledReason {
        &self.reason
    }

    /// Returns activation and optional typed value from the same evaluation.
    #[must_use]
    pub const fn indicator(&self) -> &ActionStateIndicator {
        &self.indicator
    }

    /// Returns the unchanged complete engine observation used for evaluation.
    #[must_use]
    pub const fn observation(&self) -> &EditorEngineObservation {
        &self.observation
    }
}

impl fmt::Debug for EditorDisabledAction {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("EditorDisabledAction")
            .field("action", &self.action)
            .field("reason_code", self.reason.code())
            .field("indicator", &self.indicator)
            .field("observation", &self.observation)
            .finish_non_exhaustive()
    }
}

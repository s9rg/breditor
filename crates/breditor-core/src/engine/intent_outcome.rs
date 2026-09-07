use std::fmt;

use crate::action::routing::IntentExecutionOutcome;

use super::EditorEngineObservation;

/// Complete synchronous result of one guarded semantic-intent invocation.
///
/// The execution receipt retains route provenance while the observation is the
/// exact successor basis for the next command. Blocked and unhandled outcomes
/// contain an unchanged but still authoritative observation.
#[must_use = "an editor intent outcome must be inspected or discarded explicitly"]
#[derive(Eq, PartialEq)]
pub struct EditorIntentOutcome {
    execution: IntentExecutionOutcome,
    observation: EditorEngineObservation,
}

impl EditorIntentOutcome {
    pub(super) const fn new(
        execution: IntentExecutionOutcome,
        observation: EditorEngineObservation,
    ) -> Self {
        Self { execution, observation }
    }

    /// Returns the exact semantic routing/publication receipt.
    pub const fn execution(&self) -> &IntentExecutionOutcome {
        &self.execution
    }

    /// Returns whether this invocation published a commit.
    #[must_use]
    pub const fn is_committed(&self) -> bool {
        self.execution.commit().is_some()
    }

    /// Returns the authoritative observation after this invocation.
    #[must_use]
    pub const fn observation(&self) -> &EditorEngineObservation {
        &self.observation
    }

    /// Consumes the outcome into its exact receipt and successor observation.
    pub fn into_parts(self) -> (IntentExecutionOutcome, EditorEngineObservation) {
        (self.execution, self.observation)
    }
}

impl fmt::Debug for EditorIntentOutcome {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("EditorIntentOutcome")
            .field("execution", &self.execution)
            .field("observation", &self.observation)
            .finish()
    }
}

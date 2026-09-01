use std::fmt;

use crate::action::ActionDecision;

use super::ActionStateIndicator;

/// Pure capability decision and observable state produced by one handler call.
#[derive(Clone, Eq, PartialEq)]
pub struct ActionEvaluation {
    decision: ActionDecision,
    indicator: ActionStateIndicator,
}

impl fmt::Debug for ActionEvaluation {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        let decision = match &self.decision {
            ActionDecision::Disabled(_) => "Disabled",
            ActionDecision::Enabled(_) => "Enabled",
        };
        formatter
            .debug_struct("ActionEvaluation")
            .field("decision", &decision)
            .field("indicator", &self.indicator)
            .finish_non_exhaustive()
    }
}

impl ActionEvaluation {
    /// Creates an evaluation from a decision and its same-state indicator.
    #[must_use]
    pub const fn new(decision: ActionDecision, indicator: ActionStateIndicator) -> Self {
        Self { decision, indicator }
    }

    /// Wraps a decision with the canonical stateless indicator.
    #[must_use]
    pub const fn stateless(decision: ActionDecision) -> Self {
        Self::new(decision, ActionStateIndicator::stateless())
    }

    /// Returns the authoritative availability and transaction-planning decision.
    #[must_use]
    pub const fn decision(&self) -> &ActionDecision {
        &self.decision
    }

    /// Returns activation and optional typed value from the same evaluation.
    #[must_use]
    pub const fn indicator(&self) -> &ActionStateIndicator {
        &self.indicator
    }

    pub(crate) fn into_parts(self) -> (ActionDecision, ActionStateIndicator) {
        (self.decision, self.indicator)
    }
}

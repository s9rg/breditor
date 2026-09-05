use breditor_core::{
    action::{
        Action, ActionDecision, ActionEvaluation, ActionFault, ActionStateIndicator, DisabledReason,
    },
    state::EditorState,
};

/// Test-only action used to drive otherwise unreachable Wasm snapshot branches.
#[derive(Clone)]
pub(super) struct AbiFixtureAction {
    outcome: AbiFixtureOutcome,
}

#[derive(Clone)]
enum AbiFixtureOutcome {
    Disabled { reason: DisabledReason, indicator: ActionStateIndicator },
    Fault(ActionFault),
}

impl AbiFixtureAction {
    /// Creates a deterministic expected-disabled fixture with an exact indicator.
    pub(super) fn disabled(reason: DisabledReason, indicator: ActionStateIndicator) -> Self {
        Self { outcome: AbiFixtureOutcome::Disabled { reason, indicator } }
    }

    /// Creates a deterministic handler-fault fixture.
    pub(super) fn fault(fault: ActionFault) -> Self {
        Self { outcome: AbiFixtureOutcome::Fault(fault) }
    }
}

impl Action for AbiFixtureAction {
    type Input = ();

    fn evaluate(&self, _: &EditorState, (): &Self::Input) -> Result<ActionEvaluation, ActionFault> {
        match &self.outcome {
            AbiFixtureOutcome::Disabled { reason, indicator } => Ok(ActionEvaluation::new(
                ActionDecision::Disabled(reason.clone()),
                indicator.clone(),
            )),
            AbiFixtureOutcome::Fault(fault) => Err(fault.clone()),
        }
    }
}

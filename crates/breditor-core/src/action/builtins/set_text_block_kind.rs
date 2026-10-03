//! Selection-driven semantic paragraph/heading conversion.

use super::support::{
    disabled, fault, require_operation_budget, require_text_block_range, strict_relocation,
};
use crate::{
    action::{
        Action, ActionActivation, ActionActivationContract, ActionDecision, ActionEffects,
        ActionEvaluation, ActionFault, ActionPlan, ActionStateContract, ActionStateDomains,
        ActionStateIndicator, ActionStateSpec, ActionStateValue,
    },
    block::TextBlockKind,
    operation::{
        AppliedOperation, Operation, TextBlockKindChange, TextBlockKindChangeError, block_kind,
    },
    position::TextOffset,
    state::EditorState,
    transaction::{HistoryIntent, PendingFormatsUpdate, SelectionUpdate},
};

/// Sets the semantic kind of direct-root text blocks touched by the selection.
///
/// The target is configured at registration, so this action accepts no input.
/// A range ending at the start of a later block excludes that final block.
/// Backward ranges use spatial order without changing their directional points.
/// Text, all inline properties, pending formats and selection encodings survive.
/// One invocation is one history unit; exact no-ops do not advance the revision.
/// This experimental Rust action is not registered in browser/base profiles.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct SetTextBlockKindAction {
    target: TextBlockKind,
}

impl SetTextBlockKindAction {
    /// Creates a no-input action with one immutable, checked target kind.
    #[must_use]
    pub const fn new(target: TextBlockKind) -> Self {
        Self { target }
    }

    /// Returns the kind applied to every selected block.
    #[must_use]
    pub const fn target(&self) -> TextBlockKind {
        self.target
    }
}

impl Action for SetTextBlockKindAction {
    type Input = ();

    fn state_spec() -> ActionStateSpec {
        ActionStateSpec::new(
            ActionStateContract::new(ActionActivationContract::Tracked, None),
            ActionEffects::new(
                ActionStateDomains::DOCUMENT
                    | ActionStateDomains::SELECTION
                    | ActionStateDomains::CONTEXT
                    | ActionStateDomains::SNAPSHOT,
                ActionStateDomains::DOCUMENT
                    | ActionStateDomains::HISTORY
                    | ActionStateDomains::SNAPSHOT,
            ),
        )
    }

    fn evaluate(&self, state: &EditorState, (): &()) -> Result<ActionEvaluation, ActionFault> {
        let range = match require_text_block_range(state)? {
            Ok(range) => range,
            Err(reason) => {
                return Ok(evaluation(
                    ActionDecision::Disabled(reason),
                    ActionActivation::Inactive,
                ));
            }
        };
        let start = range
            .start()
            .paragraph_path()
            .last_index()
            .ok_or_else(|| fault("breditor/block-kind-range-fault"))?;
        let end_block = range
            .end()
            .paragraph_path()
            .last_index()
            .ok_or_else(|| fault("breditor/block-kind-range-fault"))?;
        let end = if end_block > start && range.end().offset() == TextOffset::ZERO {
            end_block
        } else {
            end_block.checked_add(1).ok_or_else(|| fault("breditor/block-kind-range-fault"))?
        };
        let activation = selected_activation(state, start, end, self.target)?;
        if activation == ActionActivation::Active {
            return Ok(evaluation(disabled("breditor/block-kind-unchanged"), activation));
        }
        if let Some(decision) = require_operation_budget(state, 1) {
            return Ok(evaluation(decision, activation));
        }
        let operation = match TextBlockKindChange::capture(
            state.context(),
            state.document(),
            start..end,
            self.target,
        ) {
            Ok(operation) => operation,
            Err(TextBlockKindChangeError::Validation(_)) => {
                return Ok(evaluation(disabled("breditor/result-limit-exceeded"), activation));
            }
            Err(_) => return Err(fault("breditor/block-kind-capture-fault")),
        };
        // Preview validates the complete retained tree's resource budgets.
        // Execution repeats the source guard and publishes through Transaction.
        match operation.apply(state.context(), state.document()) {
            Ok(AppliedOperation::Changed(_)) => Ok(evaluation(
                ActionDecision::Enabled(plan(vec![Operation::TextBlockKindChange(operation)])),
                activation,
            )),
            Err(TextBlockKindChangeError::Validation(_)) => {
                Ok(evaluation(disabled("breditor/result-limit-exceeded"), activation))
            }
            _ => Err(fault("breditor/block-kind-plan-fault")),
        }
    }
}

fn selected_activation(
    state: &EditorState,
    start: u32,
    end: u32,
    target: TextBlockKind,
) -> Result<ActionActivation, ActionFault> {
    let root = state
        .document()
        .root()
        .as_element()
        .ok_or_else(|| fault("breditor/block-kind-source-fault"))?;
    let start = usize::try_from(start).map_err(|_| fault("breditor/block-kind-range-fault"))?;
    let end = usize::try_from(end).map_err(|_| fault("breditor/block-kind-range-fault"))?;
    if start >= end || end > root.children().len() {
        return Err(fault("breditor/block-kind-range-fault"));
    }
    let matches = root
        .children()
        .iter()
        .skip(start)
        .take(end - start)
        .try_fold(0, |count, node| block_kind(node).map(|kind| count + usize::from(kind == target)))
        .map_err(|_| fault("breditor/block-kind-source-fault"))?;
    Ok(if matches == 0 {
        ActionActivation::Inactive
    } else if matches == end - start {
        ActionActivation::Active
    } else {
        ActionActivation::Mixed
    })
}

fn plan(operations: Vec<Operation>) -> ActionPlan {
    ActionPlan::new(
        operations,
        strict_relocation(),
        SelectionUpdate::Relocate,
        PendingFormatsUpdate::Preserve,
        HistoryIntent::Record,
    )
}

fn evaluation(decision: ActionDecision, activation: ActionActivation) -> ActionEvaluation {
    ActionEvaluation::new(
        decision,
        ActionStateIndicator::new(activation, ActionStateValue::Unsupported),
    )
}

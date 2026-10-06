//! Atomic heading/paragraph conversion across nested text blocks.
use super::{
    flat_list_support::{evaluation, state_spec},
    insert_nested_list_structure::capture,
    nested_list_format::capture_selection,
    set_flat_list_block_kind::retype,
    support::{disabled, fault, require_operation_budget, strict_relocation},
};
use crate::{
    action::{
        Action, ActionActivation, ActionDecision, ActionEvaluation, ActionFault, ActionPlan,
        ActionStateSpec, text_position::normalize_nested_list_range_selection,
    },
    block::TextBlockKind,
    operation::{
        NestedListTextRange, NestedListTextReplace, NestedListTextReplaceError, Operation,
        block_kind,
    },
    position::{NodePath, TextOffset},
    state::EditorState,
    transaction::{HistoryIntent, PendingFormatsUpdate, SelectionUpdate},
};

/// Changes touched block kinds without changing nesting, text, inline formats,
/// markers, or starts. A later endpoint at offset zero is excluded; a collapsed
/// empty block is included. Reports active/mixed/inactive state for toolbars.
/// Selection and pending formats survive exactly. One atomic V7 operation and
/// independent undo event; unsupported schemas and unchanged kinds are disabled.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct SetNestedListBlockKindAction {
    target: TextBlockKind,
}
impl SetNestedListBlockKindAction {
    /// Creates a no-input action with a checked fixed target.
    #[must_use]
    pub const fn new(target: TextBlockKind) -> Self {
        Self { target }
    }
    /// Returns the configured target kind.
    #[must_use]
    pub const fn target(&self) -> TextBlockKind {
        self.target
    }
}
impl Action for SetNestedListBlockKindAction {
    type Input = ();
    fn state_spec() -> ActionStateSpec {
        state_spec()
    }
    fn evaluate(&self, state: &EditorState, (): &()) -> Result<ActionEvaluation, ActionFault> {
        evaluate(state, self.target)
    }
}
fn evaluate(state: &EditorState, target: TextBlockKind) -> Result<ActionEvaluation, ActionFault> {
    if !state.context().schema().supports_nested_list_reframe() {
        return Ok(evaluation(disabled("breditor/unsupported-schema"), ActionActivation::Inactive));
    }
    if state.selection().is_none() {
        return Ok(evaluation(disabled("breditor/no-selection"), ActionActivation::Inactive));
    }
    let range = normalize_nested_list_range_selection(state)
        .map_err(|_| fault("breditor/nested-kind-selection-fault"))?;
    let (mut spans, _) = capture_selection(state, &range)?;
    if !range.is_same_paragraph() && range.end().offset() == TextOffset::ZERO {
        spans.pop();
    }
    let mut replacement = Vec::new();
    let mut matched = 0;
    for span in &spans {
        let (node, _) = capture(state, span.container_path())?;
        matched += usize::from(
            block_kind(&node).map_err(|_| fault("breditor/nested-kind-source-fault"))? == target,
        );
        replacement.push(retype(&node, target)?);
    }
    let first = spans.first().ok_or_else(|| fault("breditor/nested-kind-source-fault"))?;
    let last = spans.last().ok_or_else(|| fault("breditor/nested-kind-source-fault"))?;
    let activation = if matched == 0 {
        ActionActivation::Inactive
    } else if matched == replacement.len() {
        ActionActivation::Active
    } else {
        ActionActivation::Mixed
    };
    if activation == ActionActivation::Active {
        return Ok(evaluation(disabled("breditor/block-kind-unchanged"), activation));
    }
    if let Some(decision) = require_operation_budget(state, 1) {
        return Ok(evaluation(decision, activation));
    }
    let (_, tail) = capture(state, last.container_path())?;
    let operation_range = NestedListTextRange::try_new(
        first.container_path().clone(),
        TextOffset::ZERO,
        last.container_path().clone(),
        tail.utf16_len(),
    )
    .map_err(|_| fault("breditor/nested-kind-range-fault"))?;
    let roots = (first.container_path().as_slice()[0]..=last.container_path().as_slice()[0])
        .map(|index| {
            let path = NodePath::try_from_indices(vec![index])
                .map_err(|_| fault("breditor/nested-kind-path-fault"))?;
            state
                .document()
                .node_at(&path)
                .cloned()
                .map_err(|_| fault("breditor/nested-kind-path-fault"))
        })
        .collect::<Result<Vec<_>, _>>()?;
    let operation = NestedListTextReplace::capture_layout(&roots)
        .and_then(|layout| {
            NestedListTextReplace::capture(
                state.context(),
                state.document(),
                operation_range,
                replacement,
                layout,
            )
        })
        .and_then(|op| {
            op.apply(state.context(), state.document())?;
            Ok(op)
        });
    let operation = match operation {
        Ok(op) => op,
        Err(
            NestedListTextReplaceError::Validation(_) | NestedListTextReplaceError::RootChildLimit,
        ) => return Ok(evaluation(disabled("breditor/result-limit-exceeded"), activation)),
        Err(_) => return Err(fault("breditor/nested-kind-plan-fault")),
    };
    Ok(evaluation(
        ActionDecision::Enabled(ActionPlan::new(
            vec![Operation::NestedListTextReplace(operation)],
            strict_relocation(),
            SelectionUpdate::Set(state.selection().cloned()),
            PendingFormatsUpdate::Preserve,
            HistoryIntent::Record,
        )),
        activation,
    ))
}

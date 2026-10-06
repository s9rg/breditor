//! Exact selected-range deletion with nested descendant retention.
use super::{
    DeleteSelectionAction,
    insert_nested_list_structure::plan,
    support::{disabled, fault, require_operation_budget},
};
use crate::{
    action::{
        Action, ActionDecision, ActionEvaluation, ActionFault, ActionId, ActionStateSpec,
        text_position::normalize_nested_list_range_selection,
    },
    document::TextFragment,
    identity::QualifiedName,
    position::Affinity,
    state::EditorState,
    transaction::{HistoryIntent, PendingFormatsUpdate},
};
/// Deletes the exact scalar-aligned selection, retaining the left block kind
/// and location. Surviving child sections are reattached without flattening their
/// markers. Places an After-affinity caret at the seam; one undo restores the
/// original directional range, all removed wrappers and explicit numbering.
/// A collapsed selection is disabled; this is not directional grapheme deletion.
#[derive(Clone, Copy, Debug, Default)]
pub struct DeleteNestedListSelectionAction;
/// Returns the opt-in nested selected-range deletion identity.
#[must_use]
pub fn delete_nested_list_selection_action_id() -> ActionId {
    ActionId::from_qualified_name(QualifiedName::from_known_static(
        "breditor/delete-nested-list-selection",
    ))
}
impl Action for DeleteNestedListSelectionAction {
    type Input = ();
    fn state_spec() -> ActionStateSpec {
        DeleteSelectionAction::state_spec()
    }
    fn evaluate(&self, state: &EditorState, (): &()) -> Result<ActionEvaluation, ActionFault> {
        evaluate(state).map(ActionEvaluation::stateless)
    }
}
pub(super) fn evaluate(state: &EditorState) -> Result<ActionDecision, ActionFault> {
    if !state.context().schema().supports_nested_list_reframe() {
        return Ok(disabled("breditor/unsupported-schema"));
    }
    if state.selection().is_none() {
        return Ok(disabled("breditor/no-selection"));
    }
    let range = normalize_nested_list_range_selection(state)
        .map_err(|_| fault("breditor/nested-delete-selection-fault"))?;
    if range.is_collapsed() {
        return Ok(disabled("breditor/collapsed-selection"));
    }
    if let Some(decision) = require_operation_budget(state, 1) {
        return Ok(decision);
    }
    plan(
        state,
        &range,
        &TextFragment::empty(),
        Affinity::After,
        HistoryIntent::Record,
        PendingFormatsUpdate::Preserve,
    )
}

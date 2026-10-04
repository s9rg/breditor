//! Exact selected-range deletion for flat lists and bare text blocks.
use super::{
    DeleteSelectionAction,
    delete_flat_list_support::{Deletion, evaluate},
};
use crate::{
    action::{Action, ActionEvaluation, ActionFault, ActionId, ActionStateSpec},
    identity::QualifiedName,
    state::EditorState,
};

/// Deletes the exact scalar-aligned selection in one history event, regardless
/// of direction. Cross-block ranges retain the spatial start block kind/list
/// family; untouched suffix items in a different list keep their numbering.
/// A collapsed selection is disabled. Explicit ranges do not snap to grapheme
/// boundaries. The caret has After affinity at the retained seam, pending
/// formats survive, and undo restores the exact directional selection.
/// Explicit experimental registration only; no durable wire/browser changes.
#[derive(Clone, Copy, Debug, Default)]
pub struct DeleteFlatListSelectionAction;

/// Returns the opt-in flat-list selected-range deletion identity.
#[must_use]
pub fn delete_flat_list_selection_action_id() -> ActionId {
    ActionId::from_qualified_name(QualifiedName::from_known_static(
        "breditor/delete-flat-list-selection",
    ))
}
impl Action for DeleteFlatListSelectionAction {
    type Input = ();
    fn state_spec() -> ActionStateSpec {
        DeleteSelectionAction::state_spec()
    }
    fn evaluate(&self, state: &EditorState, (): &()) -> Result<ActionEvaluation, ActionFault> {
        evaluate(state, Deletion::Selection).map(ActionEvaluation::stateless)
    }
}

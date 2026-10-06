//! Opt-in nested backward grapheme deletion.
use super::{
    DeleteBackwardAction, delete_flat_list_support::Deletion, delete_nested_list_support::evaluate,
};
use crate::{
    action::{Action, ActionEvaluation, ActionFault, ActionId, ActionStateSpec},
    identity::QualifiedName,
    state::EditorState,
};
/// Deletes one grapheme inside a nested or bare block, or the exact extended
/// selection. Preserves pending formats and records reversible V7 operations.
/// First-item starts outdent one level (root items become bare blocks).
/// Other starts join the preceding depth-first block, retaining descendants.
#[derive(Clone, Copy, Debug, Default)]
pub struct DeleteNestedListBackwardAction;
/// Returns the opt-in directional deletion identity.
#[must_use]
pub fn delete_nested_list_backward_action_id() -> ActionId {
    ActionId::from_qualified_name(QualifiedName::from_known_static(
        "breditor/delete-nested-list-backward",
    ))
}
impl Action for DeleteNestedListBackwardAction {
    type Input = ();
    fn state_spec() -> ActionStateSpec {
        DeleteBackwardAction::state_spec()
    }
    fn evaluate(&self, state: &EditorState, (): &()) -> Result<ActionEvaluation, ActionFault> {
        evaluate(state, Deletion::Backward).map(ActionEvaluation::stateless)
    }
}

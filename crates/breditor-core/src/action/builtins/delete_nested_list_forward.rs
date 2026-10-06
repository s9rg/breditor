//! Opt-in nested forward grapheme deletion.
use super::{
    DeleteForwardAction, delete_flat_list_support::Deletion, delete_nested_list_support::evaluate,
};
use crate::{
    action::{Action, ActionEvaluation, ActionFault, ActionId, ActionStateSpec},
    identity::QualifiedName,
    state::EditorState,
};
/// Deletes one grapheme inside a nested or bare block, or the exact extended
/// selection. Preserves pending formats and records reversible V7 operations.
/// At a block end, joins the next depth-first block, retaining descendants
/// and the left block's kind. At document end, the action is disabled.
#[derive(Clone, Copy, Debug, Default)]
pub struct DeleteNestedListForwardAction;
/// Returns the opt-in directional deletion identity.
#[must_use]
pub fn delete_nested_list_forward_action_id() -> ActionId {
    ActionId::from_qualified_name(QualifiedName::from_known_static(
        "breditor/delete-nested-list-forward",
    ))
}
impl Action for DeleteNestedListForwardAction {
    type Input = ();
    fn state_spec() -> ActionStateSpec {
        DeleteForwardAction::state_spec()
    }
    fn evaluate(&self, state: &EditorState, (): &()) -> Result<ActionEvaluation, ActionFault> {
        evaluate(state, Deletion::Forward).map(ActionEvaluation::stateless)
    }
}

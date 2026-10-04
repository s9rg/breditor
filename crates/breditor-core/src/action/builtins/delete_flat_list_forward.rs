//! Opt-in forward deletion for flat lists and bare text blocks.
use super::{
    DeleteForwardAction,
    delete_flat_list_support::{Deletion, evaluate},
};
use crate::{
    action::{Action, ActionEvaluation, ActionFault, ActionId, ActionStateSpec},
    identity::QualifiedName,
    state::EditorState,
};

/// Deletes the next extended grapheme cluster, ignoring formatting seams.
/// A caret inside a cluster is disabled; newly formed clusters snap backward.
/// At a block end, joins the following item/bare block, retaining the spatial
/// left kind and container. Unselected suffix items in another list remain
/// separate with original numbering. At document end, the action is disabled.
///
/// Pending formats survive. Directional deletions group; exact extended-range
/// deletion is a separate event. Explicit experimental registration only;
/// no existing browser registry or durable wire is widened.
#[derive(Clone, Copy, Debug, Default)]
pub struct DeleteFlatListForwardAction;

/// Returns the opt-in flat-list forward-deletion identity.
#[must_use]
pub fn delete_flat_list_forward_action_id() -> ActionId {
    ActionId::from_qualified_name(QualifiedName::from_known_static(
        "breditor/delete-flat-list-forward",
    ))
}
impl Action for DeleteFlatListForwardAction {
    type Input = ();
    fn state_spec() -> ActionStateSpec {
        DeleteForwardAction::state_spec()
    }
    fn evaluate(&self, state: &EditorState, (): &()) -> Result<ActionEvaluation, ActionFault> {
        evaluate(state, Deletion::Forward).map(ActionEvaluation::stateless)
    }
}

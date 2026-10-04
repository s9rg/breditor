//! Opt-in backward deletion for flat lists and bare text blocks.
use super::{
    DeleteBackwardAction,
    delete_flat_list_support::{Deletion, evaluate},
};
use crate::{
    action::{Action, ActionEvaluation, ActionFault, ActionId, ActionStateSpec},
    identity::QualifiedName,
    state::EditorState,
};

/// Deletes the previous extended grapheme cluster, ignoring formatting seams.
/// A caret inside a cluster is disabled; newly formed clusters snap forward.
/// At the first item's start, lifts that item into a bare block without changing
/// its kind/text; suffix numbering survives. Later item starts join leftward.
/// Bare block starts join the preceding block, retaining the spatial left kind
/// and list family. At the document's bare start, the action is disabled.
///
/// Exact extended selections delete in one independent history event. Pending
/// formats survive, directional deletions group, and first-item lifting records
/// a separate event. Explicit experimental registration; no new durable wire.
#[derive(Clone, Copy, Debug, Default)]
pub struct DeleteFlatListBackwardAction;

/// Returns the opt-in flat-list backward-deletion identity.
#[must_use]
pub fn delete_flat_list_backward_action_id() -> ActionId {
    ActionId::from_qualified_name(QualifiedName::from_known_static(
        "breditor/delete-flat-list-backward",
    ))
}
impl Action for DeleteFlatListBackwardAction {
    type Input = ();
    fn state_spec() -> ActionStateSpec {
        DeleteBackwardAction::state_spec()
    }
    fn evaluate(&self, state: &EditorState, (): &()) -> Result<ActionEvaluation, ActionFault> {
        evaluate(state, Deletion::Backward).map(ActionEvaluation::stateless)
    }
}

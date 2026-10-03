//! Experimental heading-aware forward deletion.
use super::{
    DeleteForwardAction,
    delete_text_block_support::{Deletion, evaluate},
};
use crate::{
    action::{Action, ActionEvaluation, ActionFault, ActionId, ActionStateSpec},
    identity::QualifiedName,
    state::EditorState,
};

/// Deletes the following Unicode extended grapheme cluster inside a paragraph or heading.
/// Formatting seams do not break clusters. A caret inside a cluster is disabled;
/// a newly joined cluster snaps the result caret backward. Adjacent deletions merge.
///
/// Extended selections form an independent history event. Rank, surviving typed
/// formats and pending formats are preserved exactly; undo restores the original
/// directional selection. Cross-block ranges and boundary joins are not yet
/// supported. Opt-in only: no default/browser registration or durable recipe.
#[derive(Clone, Copy, Debug, Default)]
pub struct DeleteTextBlockForwardAction;

/// Returns the opt-in experimental forward-deletion identity.
#[must_use]
pub fn delete_text_block_forward_action_id() -> ActionId {
    ActionId::from_qualified_name(QualifiedName::from_known_static(
        "breditor/delete-text-block-forward",
    ))
}

impl Action for DeleteTextBlockForwardAction {
    type Input = ();
    fn state_spec() -> ActionStateSpec {
        DeleteForwardAction::state_spec()
    }
    fn evaluate(&self, state: &EditorState, (): &()) -> Result<ActionEvaluation, ActionFault> {
        evaluate(state, Deletion::Forward).map(ActionEvaluation::stateless)
    }
}

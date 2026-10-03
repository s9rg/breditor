//! Experimental heading-aware backward deletion.
use super::{
    DeleteBackwardAction,
    delete_text_block_support::{Deletion, evaluate},
};
use crate::{
    action::{Action, ActionEvaluation, ActionFault, ActionId, ActionStateSpec},
    identity::QualifiedName,
    state::EditorState,
};

/// Deletes the preceding Unicode extended grapheme cluster inside a paragraph or heading.
/// Formatting seams do not break clusters. A caret inside a cluster is disabled;
/// a newly joined cluster snaps the result caret forward. Adjacent deletions merge.
///
/// Extended selections form an independent history event. Rank, surviving typed
/// formats and pending formats are preserved exactly; undo restores the original
/// directional selection. Cross-block deletion and boundary joins retain the
/// spatial left block's kind; undo restores both kinds. Opt-in only: no
/// default/browser registration or durable recipe.
#[derive(Clone, Copy, Debug, Default)]
pub struct DeleteTextBlockBackwardAction;

/// Returns the opt-in experimental backward-deletion identity.
#[must_use]
pub fn delete_text_block_backward_action_id() -> ActionId {
    ActionId::from_qualified_name(QualifiedName::from_known_static(
        "breditor/delete-text-block-backward",
    ))
}

impl Action for DeleteTextBlockBackwardAction {
    type Input = ();
    fn state_spec() -> ActionStateSpec {
        DeleteBackwardAction::state_spec()
    }
    fn evaluate(&self, state: &EditorState, (): &()) -> Result<ActionEvaluation, ActionFault> {
        evaluate(state, Deletion::Backward).map(ActionEvaluation::stateless)
    }
}

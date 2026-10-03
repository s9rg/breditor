//! Experimental heading-aware selection deletion.
use super::{
    DeleteSelectionAction,
    delete_text_block_support::{Deletion, evaluate},
};
use crate::{
    action::{Action, ActionEvaluation, ActionFault, ActionId, ActionStateSpec},
    identity::QualifiedName,
    state::EditorState,
};

/// Deletes the exact scalar-aligned selected range inside a paragraph or heading.
/// Forward and backward selections delete the same spatial text; the resulting
/// caret is at its start. A collapsed selection is disabled.
///
/// Extended selections form an independent history event. Rank, surviving typed
/// formats and pending formats are preserved exactly; undo restores the original
/// directional selection. Cross-block ranges and boundary joins are not yet
/// supported. Opt-in only: no default/browser registration or durable recipe.
#[derive(Clone, Copy, Debug, Default)]
pub struct DeleteTextBlockSelectionAction;

/// Returns the opt-in experimental selection-deletion identity.
#[must_use]
pub fn delete_text_block_selection_action_id() -> ActionId {
    ActionId::from_qualified_name(QualifiedName::from_known_static(
        "breditor/delete-text-block-selection",
    ))
}

impl Action for DeleteTextBlockSelectionAction {
    type Input = ();
    fn state_spec() -> ActionStateSpec {
        DeleteSelectionAction::state_spec()
    }
    fn evaluate(&self, state: &EditorState, (): &()) -> Result<ActionEvaluation, ActionFault> {
        evaluate(state, Deletion::Selection).map(ActionEvaluation::stateless)
    }
}

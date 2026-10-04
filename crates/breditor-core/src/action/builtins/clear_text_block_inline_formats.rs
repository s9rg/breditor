//! Clear all inline formats in the opt-in paragraph/heading profile.
use super::{
    clear_inline_formats::clear_inline_formats_state_spec, text_block_format::evaluate,
    text_block_format_request::FormatRequest,
};
use crate::{
    action::{Action, ActionEvaluation, ActionFault, ActionId, ActionStateSpec},
    identity::QualifiedName,
    state::EditorState,
};

/// Removes every selected inline format in one atomic undo event, preserving
/// block kinds and text positions. At a caret, sets explicit plain typing formats.
/// A text-empty structural selection or already plain selection is disabled.
/// Experimental only; absent from the shipping base registry.
#[derive(Clone, Copy, Debug, Default)]
pub struct ClearTextBlockInlineFormatsAction;

/// Returns the distinct experimental clear-format action identity.
#[must_use]
pub fn clear_text_block_inline_formats_action_id() -> ActionId {
    ActionId::from_qualified_name(QualifiedName::from_known_static(
        "breditor/clear-text-block-inline-formats",
    ))
}
impl Action for ClearTextBlockInlineFormatsAction {
    type Input = ();
    fn state_spec() -> ActionStateSpec {
        clear_inline_formats_state_spec()
    }
    fn evaluate(&self, state: &EditorState, (): &()) -> Result<ActionEvaluation, ActionFault> {
        evaluate(state, &FormatRequest::Clear)
    }
}

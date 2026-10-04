//! Clear inline formatting in the opt-in flat-list profile.
use super::{
    clear_inline_formats::clear_inline_formats_state_spec, flat_list_format::evaluate,
    text_block_format_request::FormatRequest,
};
use crate::{
    action::{Action, ActionEvaluation, ActionFault, ActionId, ActionStateSpec},
    identity::QualifiedName,
    state::EditorState,
};

/// Clears selected inline formats without changing block kinds, list structure,
/// numbering or text positions. At a caret, sets explicit plain pending formats.
/// Already-plain or text-empty structural ranges are disabled. Explicit
/// experimental registration; no existing browser registry or durable wire change.
#[derive(Clone, Copy, Debug, Default)]
pub struct ClearFlatListInlineFormatsAction;
/// Returns the opt-in flat-list clear-inline-formats identity.
#[must_use]
pub fn clear_flat_list_inline_formats_action_id() -> ActionId {
    ActionId::from_qualified_name(QualifiedName::from_known_static(
        "breditor/clear-flat-list-inline-formats",
    ))
}
impl Action for ClearFlatListInlineFormatsAction {
    type Input = ();
    fn state_spec() -> ActionStateSpec {
        clear_inline_formats_state_spec()
    }
    fn evaluate(&self, state: &EditorState, (): &()) -> Result<ActionEvaluation, ActionFault> {
        evaluate(state, &FormatRequest::Clear)
    }
}

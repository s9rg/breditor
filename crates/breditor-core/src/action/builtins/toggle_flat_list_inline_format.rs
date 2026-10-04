//! Property-free inline-format toggle for the opt-in flat-list profile.
use super::{
    flat_list_format::evaluate, text_block_format_request::FormatRequest,
    toggle_inline_format::toggle_inline_format_state_spec,
};
use crate::{
    action::{Action, ActionEvaluation, ActionFault, ActionStateSpec},
    identity::QualifiedName,
    state::EditorState,
};

/// Toggles a property-free format across selected bare/list text blocks.
/// Mixed selections add everywhere; uniformly active selections remove it.
/// Carets update pending formats only. Extended edits retain text, block kinds,
/// numbering and logical directional selection as one atomic undo event.
/// Explicit experimental registration; existing browser and wire profiles stay closed.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ToggleFlatListInlineFormatAction {
    format_kind: QualifiedName,
}
impl ToggleFlatListInlineFormatAction {
    /// Configures the format; the host supplies the registered action identity.
    #[must_use]
    pub const fn new(format_kind: QualifiedName) -> Self {
        Self { format_kind }
    }
    /// Returns the configured format kind.
    #[must_use]
    pub const fn format_kind(&self) -> &QualifiedName {
        &self.format_kind
    }
}
impl Action for ToggleFlatListInlineFormatAction {
    type Input = ();
    fn state_spec() -> ActionStateSpec {
        toggle_inline_format_state_spec()
    }
    fn evaluate(&self, state: &EditorState, (): &()) -> Result<ActionEvaluation, ActionFault> {
        evaluate(state, &FormatRequest::Toggle(&self.format_kind))
    }
}

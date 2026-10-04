//! Property-free format toggling for the opt-in paragraph/heading profile.
use super::{
    text_block_format::evaluate, text_block_format_request::FormatRequest,
    toggle_inline_format::toggle_inline_format_state_spec,
};
use crate::{
    action::{Action, ActionEvaluation, ActionFault, ActionStateSpec},
    identity::QualifiedName,
    state::EditorState,
};

/// Toggles a configured property-free format across selected text blocks.
/// Mixed selections add the format everywhere; uniformly active selections
/// remove it. Collapsed selections update pending typing formats only. Extended
/// edits preserve block kinds, text, direction and affinities as one undo step.
/// Experimental only; never registered by the shipping base registry.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ToggleTextBlockInlineFormatAction {
    format_kind: QualifiedName,
}

impl ToggleTextBlockInlineFormatAction {
    /// Creates a handler whose identity is supplied by its registration.
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
impl Action for ToggleTextBlockInlineFormatAction {
    type Input = ();
    fn state_spec() -> ActionStateSpec {
        toggle_inline_format_state_spec()
    }
    fn evaluate(&self, state: &EditorState, (): &()) -> Result<ActionEvaluation, ActionFault> {
        evaluate(state, &FormatRequest::Toggle(&self.format_kind))
    }
}

//! Typed inline-format replacement for the opt-in paragraph/heading profile.
use super::{
    SetInlineFormatAction, SetInlineFormatInput, text_block_format::evaluate,
    text_block_format_request::FormatRequest,
};
use crate::{
    action::{Action, ActionEvaluation, ActionFault, ActionStateSpec},
    identity::QualifiedName,
    state::EditorState,
};

/// Sets or removes one configured format using the existing typed input contract.
/// Set replaces the complete property map while preserving peer formats. Toolbar
/// state reports activation and uniform/mixed/unset properties. The compiled
/// schema admits requested properties before any change. Extended edits are
/// atomic and preserve text positions; collapsed edits only change pending formats.
/// Experimental only; durable text-block codecs and browser support are separate.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SetTextBlockInlineFormatAction {
    format_kind: QualifiedName,
}
impl SetTextBlockInlineFormatAction {
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
impl Action for SetTextBlockInlineFormatAction {
    type Input = SetInlineFormatInput;
    fn state_spec() -> ActionStateSpec {
        SetInlineFormatAction::state_spec()
    }
    fn evaluate(
        &self,
        state: &EditorState,
        input: &Self::Input,
    ) -> Result<ActionEvaluation, ActionFault> {
        evaluate(state, &FormatRequest::Set(&self.format_kind, input))
    }
}

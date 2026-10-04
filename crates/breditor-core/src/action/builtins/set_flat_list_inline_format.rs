//! Typed inline-format replacement for the opt-in flat-list profile.
use super::{
    SetInlineFormatAction, SetInlineFormatInput, flat_list_format::evaluate,
    text_block_format_request::FormatRequest,
};
use crate::{
    action::{Action, ActionEvaluation, ActionFault, ActionStateSpec},
    identity::QualifiedName,
    state::EditorState,
};

/// Sets/removes one format using the existing typed input contract. Replaces its
/// complete property map while retaining peer formats. Toolbar state reports
/// activation and uniform/mixed/unset values. Schema/property/result limits are
/// checked before publication. Carets update pending formats; ranges rewrite
/// atomically without changing list structure. Explicit experimental registration.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SetFlatListInlineFormatAction {
    format_kind: QualifiedName,
}
impl SetFlatListInlineFormatAction {
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
impl Action for SetFlatListInlineFormatAction {
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

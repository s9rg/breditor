//! Core-owned semantic actions for Breditor's sealed base-text schemas.

mod delete_backward;
mod delete_forward;
mod delete_selection;
mod format_strong;
mod grapheme_boundary;
mod inline_format_properties_state;
mod insert_paragraph_break;
mod insert_plain_text;
mod insert_text;
mod set_inline_format;
mod set_inline_format_input;
mod support;
mod toggle_inline_format;
mod toggle_strong;

pub use delete_backward::{DeleteBackwardAction, delete_backward_action_id};
pub use delete_forward::{DeleteForwardAction, delete_forward_action_id};
pub use delete_selection::{DeleteSelectionAction, delete_selection_action_id};
pub use format_strong::{
    FORMAT_STRONG_BINDING_NAME, FORMAT_STRONG_BINDING_PRIORITY, FORMAT_STRONG_INTENT_NAME,
    format_strong_binding_id, format_strong_intent_binding, format_strong_intent_declaration,
    format_strong_intent_id,
};
pub use grapheme_boundary::GRAPHEME_UNICODE_VERSION;
pub use inline_format_properties_state::{
    INLINE_FORMAT_PROPERTIES_STATE_CONTRACT_NAME, INLINE_FORMAT_PROPERTIES_STATE_VERSION,
    inline_format_properties_state_contract,
};
pub use insert_paragraph_break::{InsertParagraphBreakAction, insert_paragraph_break_action_id};
pub use insert_plain_text::{
    INSERT_PLAIN_TEXT_ACTION_NAME, INSERT_PLAIN_TEXT_EMPTY_INPUT_CODE,
    INSERT_PLAIN_TEXT_INPUT_CONTRACT_NAME, INSERT_PLAIN_TEXT_INPUT_LIMIT_CODE,
    INSERT_PLAIN_TEXT_INPUT_NOT_STRING_CODE, INSERT_PLAIN_TEXT_INPUT_VERSION,
    INSERT_PLAIN_TEXT_PARAGRAPH_LIMIT_CODE, InsertPlainTextAction, InsertPlainTextInput,
    InsertPlainTextInputError, MAX_INSERT_PLAIN_TEXT_BYTES, MAX_INSERT_PLAIN_TEXT_PARAGRAPHS,
    MAX_INSERT_PLAIN_TEXT_UTF16_CODE_UNITS, insert_plain_text_action_id,
    insert_plain_text_input_contract,
};
pub use insert_text::{
    INSERT_TEXT_ACTION_NAME, INSERT_TEXT_EMPTY_INPUT_CODE, INSERT_TEXT_HISTORY_GROUP_NAME,
    INSERT_TEXT_INPUT_CONTRACT_NAME, INSERT_TEXT_INPUT_LIMIT_CODE,
    INSERT_TEXT_INPUT_NOT_STRING_CODE, INSERT_TEXT_INPUT_VERSION, InsertTextAction,
    InsertTextInput, InsertTextInputError, MAX_INSERT_TEXT_BYTES, MAX_INSERT_TEXT_UTF16_CODE_UNITS,
    insert_text_action_id, insert_text_input_contract,
};
pub use set_inline_format::SetInlineFormatAction;
pub use set_inline_format_input::{
    SET_INLINE_FORMAT_INPUT_CONTRACT_NAME, SET_INLINE_FORMAT_INPUT_NOT_OBJECT_CODE,
    SET_INLINE_FORMAT_INPUT_OPERATION_CODE, SET_INLINE_FORMAT_INPUT_PROPERTY_NAME_CODE,
    SET_INLINE_FORMAT_INPUT_PROPERTY_ORDER_CODE, SET_INLINE_FORMAT_INPUT_SHAPE_CODE,
    SET_INLINE_FORMAT_INPUT_VERSION, SetInlineFormatInput, set_inline_format_input_contract,
};
pub use toggle_inline_format::ToggleInlineFormatAction;
pub use toggle_strong::{ToggleStrongAction, toggle_strong_action_id};

use crate::action::{
    ActionRegistration, ActionRegistry, ActionRegistryError,
    routing::{IntentBinding, IntentDeclaration},
};

/// Returns all base action registrations without freezing a registry.
///
/// Hosts can append extension registrations and then call
/// [`ActionRegistry::try_new`]. Duplicate action identities reject the complete
/// registry instead of silently overriding a built-in.
#[must_use]
pub fn base_action_registrations() -> Vec<ActionRegistration> {
    vec![
        ActionRegistration::new(delete_backward_action_id(), DeleteBackwardAction),
        ActionRegistration::new(delete_forward_action_id(), DeleteForwardAction),
        ActionRegistration::new(delete_selection_action_id(), DeleteSelectionAction),
        ActionRegistration::new(insert_paragraph_break_action_id(), InsertParagraphBreakAction),
        ActionRegistration::with_input(
            insert_plain_text_action_id(),
            insert_plain_text_input_contract(),
            InsertPlainTextAction,
        ),
        ActionRegistration::with_input(
            insert_text_action_id(),
            insert_text_input_contract(),
            InsertTextAction,
        ),
        ActionRegistration::new(toggle_strong_action_id(), ToggleStrongAction),
    ]
}

/// Builds the immutable registry containing Breditor's base actions.
///
/// # Errors
///
/// Returns [`ActionRegistryError`] if the built-in catalog ever contains a
/// conflicting identity. This is returned, rather than hidden behind a panic,
/// so registry construction keeps the same fail-closed contract as extensions.
pub fn base_action_registry() -> Result<ActionRegistry, ActionRegistryError> {
    ActionRegistry::try_new(base_action_registrations())
}

/// Returns every built-in semantic intent declaration without freezing a router.
///
/// Hosts compiling a base-text profile append extension declarations before
/// constructing the immutable router. The returned declarations contain no
/// browser event, shortcut, or presentation policy.
#[must_use]
pub fn base_intent_declarations() -> Vec<IntentDeclaration> {
    vec![format_strong_intent_declaration()]
}

/// Returns every built-in semantic intent binding without freezing a router.
///
/// The binding targets an action in [`base_action_registrations`]. Hosts must
/// freeze declarations, bindings, and the complete action registry together so
/// identity and state-contract mismatches fail closed.
#[must_use]
pub fn base_intent_bindings() -> Vec<IntentBinding> {
    vec![format_strong_intent_binding()]
}

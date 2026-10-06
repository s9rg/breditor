//! Core-owned semantic actions for Breditor's sealed base-text schemas.
#[cfg(feature = "experimental-structural-properties")]
mod insert_nested_list_break;
#[cfg(all(test, feature = "experimental-structural-properties"))]
mod insert_nested_list_break_tests;
#[cfg(feature = "experimental-structural-properties")]
pub use insert_nested_list_break::{InsertNestedListBreakAction, insert_nested_list_break_action_id};

#[cfg(feature = "experimental-structural-properties")]
mod clear_nested_list_inline_formats;
#[cfg(feature = "experimental-structural-properties")]
mod nested_list_format;
#[cfg(all(test, feature = "experimental-structural-properties"))]
mod nested_list_format_tests;
#[cfg(feature = "experimental-structural-properties")]
mod set_nested_list_inline_format;
#[cfg(feature = "experimental-structural-properties")]
mod toggle_nested_list_inline_format;
#[cfg(feature = "experimental-structural-properties")]
pub use clear_nested_list_inline_formats::{
    ClearNestedListInlineFormatsAction, clear_nested_list_inline_formats_action_id,
};
#[cfg(feature = "experimental-structural-properties")]
pub use set_nested_list_inline_format::SetNestedListInlineFormatAction;
#[cfg(feature = "experimental-structural-properties")]
pub use toggle_nested_list_inline_format::ToggleNestedListInlineFormatAction;

#[cfg(feature = "experimental-structural-properties")]
mod clear_flat_list_inline_formats;
mod clear_inline_formats;
#[cfg(all(test, feature = "experimental-structural-properties"))]
mod flat_list_action_tests;
#[cfg(feature = "experimental-structural-properties")]
mod flat_list_format;
#[cfg(feature = "experimental-structural-properties")]
mod flat_list_format_source;
#[cfg(feature = "experimental-structural-properties")]
mod flat_list_support;
#[cfg(feature = "experimental-structural-properties")]
mod flat_list_text_support;
#[cfg(feature = "experimental-structural-properties")]
mod set_flat_list_block_kind;
#[cfg(feature = "experimental-structural-properties")]
mod set_flat_list_inline_format;
#[cfg(feature = "experimental-structural-properties")]
mod toggle_flat_list_inline_format;
#[cfg(feature = "experimental-structural-properties")]
pub use clear_flat_list_inline_formats::{
    ClearFlatListInlineFormatsAction, clear_flat_list_inline_formats_action_id,
};
#[cfg(feature = "experimental-structural-properties")]
pub use set_flat_list_block_kind::SetFlatListBlockKindAction;
#[cfg(feature = "experimental-structural-properties")]
pub use set_flat_list_inline_format::SetFlatListInlineFormatAction;
#[cfg(feature = "experimental-structural-properties")]
pub use toggle_flat_list_inline_format::ToggleFlatListInlineFormatAction;
#[cfg(all(test, feature = "experimental-structural-properties"))]
mod flat_list_format_tests;
#[cfg(feature = "experimental-structural-properties")]
mod insert_flat_list_break;
#[cfg(feature = "experimental-structural-properties")]
pub use insert_flat_list_break::{InsertFlatListBreakAction, insert_flat_list_break_action_id};
#[cfg(all(test, feature = "experimental-structural-properties"))]
mod insert_flat_list_break_tests;
#[cfg(feature = "experimental-structural-properties")]
mod insert_flat_list_structure;
#[cfg(feature = "experimental-structural-properties")]
mod insert_flat_list_text;
#[cfg(feature = "experimental-structural-properties")]
pub use insert_flat_list_text::{InsertFlatListTextAction, insert_flat_list_text_action_id};
#[cfg(feature = "experimental-structural-properties")]
mod indent_list_items;
#[cfg(feature = "experimental-structural-properties")]
mod insert_nested_list_text;
#[cfg(feature = "experimental-structural-properties")]
mod unwrap_list;
#[cfg(feature = "experimental-structural-properties")]
mod wrap_list;
#[cfg(feature = "experimental-structural-properties")]
pub use insert_nested_list_text::{InsertNestedListTextAction, insert_nested_list_text_action_id};
#[cfg(feature = "experimental-structural-properties")]
mod nested_list_support;
#[cfg(feature = "experimental-structural-properties")]
mod outdent_list_items;
#[cfg(feature = "experimental-structural-properties")]
pub use outdent_list_items::OutdentListItemsAction;
#[cfg(all(test, feature = "experimental-structural-properties"))]
mod outdent_list_items_tests;
#[cfg(feature = "experimental-structural-properties")]
pub use indent_list_items::IndentListItemsAction;
#[cfg(all(test, feature = "experimental-structural-properties"))]
mod indent_list_items_tests;
#[cfg(feature = "experimental-structural-properties")]
pub use unwrap_list::UnwrapListAction;
#[cfg(feature = "experimental-structural-properties")]
pub use wrap_list::WrapListAction;
#[cfg(feature = "experimental-structural-properties")]
mod clear_text_block_inline_formats;
#[cfg(feature = "experimental-structural-properties")]
mod set_text_block_inline_format;
#[cfg(feature = "experimental-structural-properties")]
mod text_block_format;
#[cfg(feature = "experimental-structural-properties")]
mod text_block_format_request;
#[cfg(all(test, feature = "experimental-structural-properties"))]
mod text_block_format_tests;
#[cfg(feature = "experimental-structural-properties")]
mod toggle_text_block_inline_format;
#[cfg(feature = "experimental-structural-properties")]
pub use clear_text_block_inline_formats::{
    ClearTextBlockInlineFormatsAction, clear_text_block_inline_formats_action_id,
};
#[cfg(feature = "experimental-structural-properties")]
pub use set_text_block_inline_format::SetTextBlockInlineFormatAction;
#[cfg(feature = "experimental-structural-properties")]
pub use toggle_text_block_inline_format::ToggleTextBlockInlineFormatAction;
mod clear_inline_formatting;
mod delete_backward;
#[cfg(feature = "experimental-structural-properties")]
mod delete_flat_list_backward;
#[cfg(feature = "experimental-structural-properties")]
mod delete_flat_list_forward;
#[cfg(feature = "experimental-structural-properties")]
mod delete_flat_list_selection;
#[cfg(feature = "experimental-structural-properties")]
mod delete_flat_list_structure;
#[cfg(feature = "experimental-structural-properties")]
mod delete_flat_list_support;
#[cfg(all(test, feature = "experimental-structural-properties"))]
mod delete_flat_list_tests;
mod delete_forward;
mod delete_selection;
#[cfg(feature = "experimental-structural-properties")]
pub use delete_flat_list_backward::{
    DeleteFlatListBackwardAction, delete_flat_list_backward_action_id,
};
#[cfg(feature = "experimental-structural-properties")]
pub use delete_flat_list_forward::{
    DeleteFlatListForwardAction, delete_flat_list_forward_action_id,
};
#[cfg(feature = "experimental-structural-properties")]
pub use delete_flat_list_selection::{
    DeleteFlatListSelectionAction, delete_flat_list_selection_action_id,
};
#[cfg(feature = "experimental-structural-properties")]
mod delete_text_block_backward;
#[cfg(feature = "experimental-structural-properties")]
mod delete_text_block_forward;
#[cfg(feature = "experimental-structural-properties")]
mod delete_text_block_selection;
#[cfg(feature = "experimental-structural-properties")]
mod delete_text_block_structure;
#[cfg(all(test, feature = "experimental-structural-properties"))]
mod delete_text_block_structure_tests;
#[cfg(feature = "experimental-structural-properties")]
mod delete_text_block_support;
#[cfg(all(test, feature = "experimental-structural-properties"))]
mod delete_text_block_tests;
#[cfg(feature = "experimental-structural-properties")]
mod text_block_support;
#[cfg(feature = "experimental-structural-properties")]
pub use delete_text_block_backward::{
    DeleteTextBlockBackwardAction, delete_text_block_backward_action_id,
};
#[cfg(feature = "experimental-structural-properties")]
pub use delete_text_block_forward::{
    DeleteTextBlockForwardAction, delete_text_block_forward_action_id,
};
#[cfg(feature = "experimental-structural-properties")]
pub use delete_text_block_selection::{
    DeleteTextBlockSelectionAction, delete_text_block_selection_action_id,
};
mod format_strong;
mod grapheme_boundary;
mod inline_format_properties_state;
#[cfg(feature = "experimental-structural-properties")]
mod insert_flat_list_plain_text;
mod insert_paragraph_break;
mod insert_plain_text;
#[cfg(feature = "experimental-structural-properties")]
pub use insert_flat_list_plain_text::{
    InsertFlatListPlainTextAction, insert_flat_list_plain_text_action_id,
};
#[cfg(all(test, feature = "experimental-structural-properties"))]
mod insert_flat_list_plain_text_tests;
#[cfg(feature = "experimental-structural-properties")]
mod insert_text_block_plain_text;
#[cfg(feature = "experimental-structural-properties")]
pub use insert_text_block_plain_text::{
    InsertTextBlockPlainTextAction, insert_text_block_plain_text_action_id,
};
mod insert_text;
#[cfg(feature = "experimental-structural-properties")]
mod insert_text_block_break;
#[cfg(all(test, feature = "experimental-structural-properties"))]
mod insert_text_block_plain_text_tests;
#[cfg(feature = "experimental-structural-properties")]
pub use insert_text_block_break::{InsertTextBlockBreakAction, insert_text_block_break_action_id};
#[cfg(all(test, feature = "experimental-structural-properties"))]
mod insert_text_block_break_tests;
#[cfg(feature = "experimental-structural-properties")]
mod insert_text_block_structure;
#[cfg(all(test, feature = "experimental-structural-properties"))]
mod insert_text_block_structure_tests;
#[cfg(feature = "experimental-structural-properties")]
mod insert_text_block_text;
#[cfg(all(test, feature = "experimental-structural-properties"))]
mod insert_text_block_text_tests;
mod set_inline_format;
mod set_inline_format_input;
#[cfg(feature = "experimental-structural-properties")]
mod set_text_block_kind;
mod support;
mod toggle_inline_format;
mod toggle_strong;
#[cfg(feature = "experimental-structural-properties")]
pub use insert_text_block_text::{InsertTextBlockTextAction, insert_text_block_text_action_id};
#[cfg(feature = "experimental-structural-properties")]
pub use set_text_block_kind::SetTextBlockKindAction;

pub use clear_inline_formats::{
    CLEAR_INLINE_FORMATS_ACTION_NAME, ClearInlineFormatsAction, clear_inline_formats_action_id,
};
pub use clear_inline_formatting::{
    CLEAR_INLINE_FORMATTING_BINDING_NAME, CLEAR_INLINE_FORMATTING_BINDING_PRIORITY,
    CLEAR_INLINE_FORMATTING_INTENT_NAME, CLEAR_INLINE_FORMATTING_STATE_NAME,
    clear_inline_formatting_binding_id, clear_inline_formatting_intent_binding,
    clear_inline_formatting_intent_declaration, clear_inline_formatting_intent_id,
    clear_inline_formatting_state_id,
};
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
        ActionRegistration::new(clear_inline_formats_action_id(), ClearInlineFormatsAction),
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
    vec![clear_inline_formatting_intent_declaration(), format_strong_intent_declaration()]
}

/// Returns every built-in semantic intent binding without freezing a router.
///
/// The binding targets an action in [`base_action_registrations`]. Hosts must
/// freeze declarations, bindings, and the complete action registry together so
/// identity and state-contract mismatches fail closed.
#[must_use]
pub fn base_intent_bindings() -> Vec<IntentBinding> {
    vec![clear_inline_formatting_intent_binding(), format_strong_intent_binding()]
}

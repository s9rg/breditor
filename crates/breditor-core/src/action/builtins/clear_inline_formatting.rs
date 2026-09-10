use crate::{
    action::{
        Action, ActionStateId,
        routing::{
            BindingId, BindingPriority, DisabledRouting, IntentBinding, IntentDeclaration, IntentId,
        },
    },
    identity::QualifiedName,
};

use super::{ClearInlineFormatsAction, clear_inline_formats_action_id};

/// Stable qualified name of the built-in clear-inline-formatting intent.
pub const CLEAR_INLINE_FORMATTING_INTENT_NAME: &str = "breditor/clear-inline-formatting";

/// Stable qualified name of the built-in clear-inline-formatting binding.
pub const CLEAR_INLINE_FORMATTING_BINDING_NAME: &str = "breditor/clear-inline-formatting-binding";

/// Stable qualified name of the built-in Clear Formatting action-state entry.
pub const CLEAR_INLINE_FORMATTING_STATE_NAME: &str = "breditor/control-clear-inline-formatting";

/// Fixed priority of the built-in clear-inline-formatting binding.
pub const CLEAR_INLINE_FORMATTING_BINDING_PRIORITY: BindingPriority = BindingPriority::new(0);

/// Returns the stable built-in clear-inline-formatting intent identity.
#[must_use]
pub fn clear_inline_formatting_intent_id() -> IntentId {
    IntentId::from_qualified_name(QualifiedName::from_known_static(
        CLEAR_INLINE_FORMATTING_INTENT_NAME,
    ))
}

/// Returns the stable built-in clear-inline-formatting binding identity.
#[must_use]
pub fn clear_inline_formatting_binding_id() -> BindingId {
    BindingId::from_qualified_name(QualifiedName::from_known_static(
        CLEAR_INLINE_FORMATTING_BINDING_NAME,
    ))
}

/// Returns the stable built-in Clear Formatting action-state identity.
#[must_use]
pub fn clear_inline_formatting_state_id() -> ActionStateId {
    ActionStateId::from_qualified_name(QualifiedName::from_known_static(
        CLEAR_INLINE_FORMATTING_STATE_NAME,
    ))
}

/// Returns the stateless, no-input declaration of the clear-inline-formatting intent.
///
/// Its observable contract exactly matches [`ClearInlineFormatsAction`], so
/// toolbar and other host surfaces can consume the semantic intent without
/// naming a concrete Rust action.
#[must_use]
pub fn clear_inline_formatting_intent_declaration() -> IntentDeclaration {
    IntentDeclaration::without_input(clear_inline_formatting_intent_id())
        .with_state_spec(ClearInlineFormatsAction::state_spec())
}

/// Returns the priority-zero blocking route from the intent to the clear action.
///
/// Blocking preserves the action's exact disabled reason and does not permit a
/// lower-priority route to reinterpret a request to clear every inline format.
#[must_use]
pub fn clear_inline_formatting_intent_binding() -> IntentBinding {
    IntentBinding::new(
        clear_inline_formatting_binding_id(),
        clear_inline_formatting_intent_id(),
        clear_inline_formats_action_id(),
        CLEAR_INLINE_FORMATTING_BINDING_PRIORITY,
        DisabledRouting::Block,
    )
}

#[cfg(test)]
mod tests {
    use crate::action::{ActionActivationContract, builtins::clear_inline_formats_action_id};

    use super::*;

    #[test]
    fn public_clear_inline_formatting_route_is_exact_and_stateless() {
        let declaration = clear_inline_formatting_intent_declaration();
        let binding = clear_inline_formatting_intent_binding();

        assert_eq!(
            clear_inline_formatting_intent_id().as_str(),
            CLEAR_INLINE_FORMATTING_INTENT_NAME,
        );
        assert_eq!(
            clear_inline_formatting_binding_id().as_str(),
            CLEAR_INLINE_FORMATTING_BINDING_NAME,
        );
        assert_eq!(clear_inline_formatting_state_id().as_str(), CLEAR_INLINE_FORMATTING_STATE_NAME,);
        assert_eq!(declaration.id(), &clear_inline_formatting_intent_id());
        assert!(declaration.input_contract().is_none());
        assert_eq!(
            declaration.state_spec().contract().activation_contract(),
            ActionActivationContract::Stateless,
        );
        assert_eq!(binding.id(), &clear_inline_formatting_binding_id());
        assert_eq!(binding.intent_id(), declaration.id());
        assert_eq!(binding.action_id(), &clear_inline_formats_action_id());
        assert_eq!(binding.priority(), CLEAR_INLINE_FORMATTING_BINDING_PRIORITY);
        assert_eq!(binding.disabled_routing(), DisabledRouting::Block);
    }
}

use crate::{action::Action, identity::QualifiedName};

use super::{ToggleStrongAction, toggle_strong_action_id};
use crate::action::routing::{
    BindingId, BindingPriority, DisabledRouting, IntentBinding, IntentDeclaration, IntentId,
};

/// Stable qualified name of the built-in strong-format semantic intent.
pub const FORMAT_STRONG_INTENT_NAME: &str = "breditor/format-strong";

/// Stable qualified name of the built-in strong-format action binding.
pub const FORMAT_STRONG_BINDING_NAME: &str = "breditor/format-strong-binding";

/// Fixed priority of the built-in strong-format action binding.
pub const FORMAT_STRONG_BINDING_PRIORITY: BindingPriority = BindingPriority::new(0);

/// Returns the stable built-in strong-format semantic intent identity.
#[must_use]
pub fn format_strong_intent_id() -> IntentId {
    IntentId::from_qualified_name(QualifiedName::from_known_static(FORMAT_STRONG_INTENT_NAME))
}

/// Returns the stable built-in strong-format binding identity.
#[must_use]
pub fn format_strong_binding_id() -> BindingId {
    BindingId::from_qualified_name(QualifiedName::from_known_static(FORMAT_STRONG_BINDING_NAME))
}

/// Returns the tracked, no-input declaration of the built-in strong intent.
///
/// Its observable contract exactly matches [`ToggleStrongAction`], allowing a
/// toolbar or another host surface to consume the intent without coupling to
/// the concrete action selected by the frozen router.
#[must_use]
pub fn format_strong_intent_declaration() -> IntentDeclaration {
    IntentDeclaration::without_input(format_strong_intent_id())
        .with_state_spec(ToggleStrongAction::state_spec())
}

/// Returns the priority-zero blocking route from strong intent to strong action.
///
/// Blocking preserves the action's tracked indicator and disabled reason when
/// strong formatting is unavailable; it never invents a fallback action.
#[must_use]
pub fn format_strong_intent_binding() -> IntentBinding {
    IntentBinding::new(
        format_strong_binding_id(),
        format_strong_intent_id(),
        toggle_strong_action_id(),
        FORMAT_STRONG_BINDING_PRIORITY,
        DisabledRouting::Block,
    )
}

#[cfg(test)]
mod tests {
    use crate::action::{ActionActivationContract, builtins::toggle_strong_action_id};

    use super::*;

    #[test]
    fn public_strong_intent_contract_is_exact_and_tracked() {
        let declaration = format_strong_intent_declaration();
        let binding = format_strong_intent_binding();

        assert_eq!(format_strong_intent_id().as_str(), FORMAT_STRONG_INTENT_NAME);
        assert_eq!(format_strong_binding_id().as_str(), FORMAT_STRONG_BINDING_NAME);
        assert_eq!(declaration.id(), &format_strong_intent_id());
        assert!(declaration.input_contract().is_none());
        assert_eq!(
            declaration.state_spec().contract().activation_contract(),
            ActionActivationContract::Tracked,
        );
        assert_eq!(binding.id(), &format_strong_binding_id());
        assert_eq!(binding.intent_id(), declaration.id());
        assert_eq!(binding.action_id(), &toggle_strong_action_id());
        assert_eq!(binding.priority(), FORMAT_STRONG_BINDING_PRIORITY);
        assert_eq!(binding.disabled_routing(), DisabledRouting::Block);
    }
}

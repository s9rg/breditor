use crate::action::ActionId;

use super::{BindingId, BindingPriority, IntentId};

/// What routing does when this binding's action is expectedly disabled.
#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
pub enum DisabledRouting {
    /// Record the exact disabled result and evaluate the next lower priority.
    FallThrough,
    /// Stop routing and return the exact disabled result as blocked.
    Block,
}

/// Frozen declaration connecting one semantic intent to one registered action.
///
/// Bindings contain no callbacks, guards, input transforms, or browser syntax.
/// The target action remains the sole applicability decision point.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct IntentBinding {
    id: BindingId,
    intent_id: IntentId,
    action_id: ActionId,
    priority: BindingPriority,
    disabled_routing: DisabledRouting,
}

impl IntentBinding {
    /// Creates one explicit intent-to-action binding.
    #[must_use]
    pub const fn new(
        id: BindingId,
        intent_id: IntentId,
        action_id: ActionId,
        priority: BindingPriority,
        disabled_routing: DisabledRouting,
    ) -> Self {
        Self { id, intent_id, action_id, priority, disabled_routing }
    }

    /// Returns the globally unique binding identity.
    #[must_use]
    pub const fn id(&self) -> &BindingId {
        &self.id
    }

    /// Returns the declared semantic intent.
    #[must_use]
    pub const fn intent_id(&self) -> &IntentId {
        &self.intent_id
    }

    /// Returns the registered target action.
    #[must_use]
    pub const fn action_id(&self) -> &ActionId {
        &self.action_id
    }

    /// Returns this binding's explicit signed priority.
    #[must_use]
    pub const fn priority(&self) -> BindingPriority {
        self.priority
    }

    /// Returns how an expected disabled decision affects routing.
    #[must_use]
    pub const fn disabled_routing(&self) -> DisabledRouting {
        self.disabled_routing
    }
}

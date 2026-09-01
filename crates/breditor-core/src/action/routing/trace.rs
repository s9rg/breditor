use std::fmt;

use crate::action::{ActionId, DisabledReason};

use super::{BindingId, BindingPriority};

/// One expected-disabled candidate that routing deliberately passed through.
///
/// A route's trace preserves evaluation order, from highest to lowest priority,
/// together with the exact stable reason returned by each action.
#[derive(Clone, Eq, PartialEq)]
pub struct IntentFallThrough {
    binding_id: BindingId,
    action_id: ActionId,
    priority: BindingPriority,
    reason: DisabledReason,
}

impl fmt::Debug for IntentFallThrough {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("IntentFallThrough")
            .field("binding_id", &self.binding_id)
            .field("action_id", &self.action_id)
            .field("priority", &self.priority)
            .field("reason_code", &self.reason.code())
            .finish_non_exhaustive()
    }
}

impl IntentFallThrough {
    pub(crate) const fn new(
        binding_id: BindingId,
        action_id: ActionId,
        priority: BindingPriority,
        reason: DisabledReason,
    ) -> Self {
        Self { binding_id, action_id, priority, reason }
    }

    /// Returns the binding that fell through.
    #[must_use]
    pub const fn binding_id(&self) -> &BindingId {
        &self.binding_id
    }

    /// Returns the action that was expectedly disabled.
    #[must_use]
    pub const fn action_id(&self) -> &ActionId {
        &self.action_id
    }

    /// Returns the evaluated binding priority.
    #[must_use]
    pub const fn priority(&self) -> BindingPriority {
        self.priority
    }

    /// Returns the exact expected-disabled reason.
    #[must_use]
    pub const fn reason(&self) -> &DisabledReason {
        &self.reason
    }
}

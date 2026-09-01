use crate::action::ActionInput;

use super::IntentId;

/// One host-normalized request to route a declared semantic intent.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct IntentInvocation {
    id: IntentId,
    input: ActionInput,
}

impl IntentInvocation {
    /// Creates an invocation from an intent identity and wire-friendly input.
    #[must_use]
    pub const fn new(id: IntentId, input: ActionInput) -> Self {
        Self { id, input }
    }

    /// Creates an invocation for an intent that takes no input.
    #[must_use]
    pub const fn without_input(id: IntentId) -> Self {
        Self { id, input: ActionInput::None }
    }

    /// Returns the requested semantic intent identity.
    #[must_use]
    pub const fn id(&self) -> &IntentId {
        &self.id
    }

    /// Returns the normalized input forwarded unchanged to candidate actions.
    #[must_use]
    pub const fn input(&self) -> &ActionInput {
        &self.input
    }
}

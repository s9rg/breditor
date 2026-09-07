use crate::action::{ActionInputContract, ActionStateContract, routing::IntentId};

/// Owned declarative contract for one intent admitted by a compiled profile.
///
/// The descriptor carries only stable identity and input/observable shape. It
/// contains no executable handler, binding priority, or fixed invocation.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CompiledProfileIntentDescriptor {
    id: IntentId,
    input_contract: Option<ActionInputContract>,
    state_contract: ActionStateContract,
}

impl CompiledProfileIntentDescriptor {
    pub(super) fn new(
        id: IntentId,
        input_contract: Option<ActionInputContract>,
        state_contract: ActionStateContract,
    ) -> Self {
        Self { id, input_contract, state_contract }
    }

    /// Returns the admitted semantic intent identity.
    #[must_use]
    pub const fn id(&self) -> &IntentId {
        &self.id
    }

    /// Returns the exact required input contract, or `None` for no input.
    #[must_use]
    pub const fn input_contract(&self) -> Option<&ActionInputContract> {
        self.input_contract.as_ref()
    }

    /// Returns the exact observable activation/value shape.
    #[must_use]
    pub const fn state_contract(&self) -> &ActionStateContract {
        &self.state_contract
    }
}

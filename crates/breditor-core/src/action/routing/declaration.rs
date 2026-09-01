use crate::action::{ActionInputContract, ActionStateSpec};

use super::IntentId;

/// Frozen declaration of one semantic intent and its shared state/input contracts.
///
/// Every bound action must advertise exactly the same input and observable
/// shape contracts. The intent's effects must conservatively cover every bound
/// action. Declaring an intent with no bindings is valid and routes to an
/// unhandled outcome rather than being confused with an undeclared intent.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct IntentDeclaration {
    id: IntentId,
    input_contract: Option<ActionInputContract>,
    state_spec: ActionStateSpec,
}

impl IntentDeclaration {
    /// Declares an intent that accepts no input.
    #[must_use]
    pub const fn new(id: IntentId) -> Self {
        Self::without_input(id)
    }

    /// Declares an intent that accepts no input.
    #[must_use]
    pub const fn without_input(id: IntentId) -> Self {
        Self { id, input_contract: None, state_spec: ActionStateSpec::stateless() }
    }

    /// Declares an intent under an exact typed input contract.
    #[must_use]
    pub const fn with_input(id: IntentId, input_contract: ActionInputContract) -> Self {
        Self { id, input_contract: Some(input_contract), state_spec: ActionStateSpec::stateless() }
    }

    /// Replaces the default stateless, conservative observable specification.
    ///
    /// Router construction rejects a spec that claims to read session history;
    /// bound action evaluation receives only immutable editor state.
    #[must_use]
    pub fn with_state_spec(mut self, state_spec: ActionStateSpec) -> Self {
        self.state_spec = state_spec;
        self
    }

    /// Returns the declared intent identity.
    #[must_use]
    pub const fn id(&self) -> &IntentId {
        &self.id
    }

    /// Returns the required typed input contract, or `None` for no input.
    #[must_use]
    pub const fn input_contract(&self) -> Option<&ActionInputContract> {
        self.input_contract.as_ref()
    }

    /// Returns the shared observable contract and conservative route effects.
    #[must_use]
    pub const fn state_spec(&self) -> &ActionStateSpec {
        &self.state_spec
    }
}

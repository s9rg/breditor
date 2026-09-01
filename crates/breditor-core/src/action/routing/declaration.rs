use crate::action::ActionInputContract;

use super::IntentId;

/// Frozen declaration of one semantic intent and its shared input contract.
///
/// Every action bound to this intent must advertise exactly the same contract.
/// Declaring an intent with no bindings is valid and routes to an unhandled
/// outcome rather than being confused with an undeclared intent.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct IntentDeclaration {
    id: IntentId,
    input_contract: Option<ActionInputContract>,
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
        Self { id, input_contract: None }
    }

    /// Declares an intent under an exact typed input contract.
    #[must_use]
    pub const fn with_input(id: IntentId, input_contract: ActionInputContract) -> Self {
        Self { id, input_contract: Some(input_contract) }
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
}

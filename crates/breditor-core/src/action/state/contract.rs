use super::ActionStateValueContract;

/// Whether an action advertises selection-sensitive activation.
#[derive(Clone, Copy, Debug, Default, Eq, Hash, PartialEq)]
pub enum ActionActivationContract {
    /// The action has no active, inactive, or mixed state.
    #[default]
    Stateless,
    /// Every evaluation must return inactive, active, or mixed state.
    Tracked,
}

/// Exact shape contract for one action's observable indicator.
#[derive(Clone, Debug, Default, Eq, Hash, PartialEq)]
pub struct ActionStateContract {
    activation: ActionActivationContract,
    value: Option<ActionStateValueContract>,
}

impl ActionStateContract {
    /// Creates an observable shape contract.
    #[must_use]
    pub const fn new(
        activation: ActionActivationContract,
        value: Option<ActionStateValueContract>,
    ) -> Self {
        Self { activation, value }
    }

    /// Creates a contract with neither activation nor a value.
    #[must_use]
    pub const fn stateless() -> Self {
        Self { activation: ActionActivationContract::Stateless, value: None }
    }

    /// Returns the explicit activation shape contract.
    #[must_use]
    pub const fn activation_contract(&self) -> ActionActivationContract {
        self.activation
    }

    /// Returns whether active/inactive/mixed state is supported.
    #[must_use]
    pub const fn supports_activation(&self) -> bool {
        matches!(self.activation, ActionActivationContract::Tracked)
    }

    /// Returns the exact state value contract, when supported.
    #[must_use]
    pub const fn value_contract(&self) -> Option<&ActionStateValueContract> {
        self.value.as_ref()
    }
}

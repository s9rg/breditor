use super::{ActionActivation, ActionStateValue};

/// Activation and optional typed value observed during one action evaluation.
///
/// The indicator is produced in the same pure handler call as capability, so a
/// toolbar never needs a second state query with different semantics.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ActionStateIndicator {
    activation: ActionActivation,
    value: ActionStateValue,
}

impl ActionStateIndicator {
    /// Creates an indicator from orthogonal activation and value states.
    #[must_use]
    pub const fn new(activation: ActionActivation, value: ActionStateValue) -> Self {
        Self { activation, value }
    }

    /// Creates the sole valid indicator for a stateless contract.
    #[must_use]
    pub const fn stateless() -> Self {
        Self { activation: ActionActivation::Stateless, value: ActionStateValue::Unsupported }
    }

    /// Returns selection-sensitive activation.
    #[must_use]
    pub const fn activation(&self) -> ActionActivation {
        self.activation
    }

    /// Returns the optional typed state value.
    #[must_use]
    pub const fn value(&self) -> &ActionStateValue {
        &self.value
    }
}

impl Default for ActionStateIndicator {
    fn default() -> Self {
        Self::stateless()
    }
}

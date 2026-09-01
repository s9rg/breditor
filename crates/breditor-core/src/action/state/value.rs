use std::fmt;

use crate::action::ActionValue;

use super::ActionStateValueContract;

/// Optional typed value exposed by one action-state evaluation.
///
/// `Unset` is distinct from a uniform [`ActionValue::null`]: it means the
/// output contract applies but no value exists in this state. `Mixed` means no
/// single value represents the complete evaluated selection.
#[derive(Clone, Default, Eq, PartialEq)]
pub enum ActionStateValue {
    /// The action declares no state value contract.
    #[default]
    Unsupported,
    /// The contract applies, but this state has no value.
    Unset {
        /// Exact output value contract.
        contract: ActionStateValueContract,
    },
    /// Every relevant part of the state has one canonical value.
    Uniform {
        /// Exact output value contract.
        contract: ActionStateValueContract,
        /// Bounded canonical output value.
        value: ActionValue,
    },
    /// Relevant parts of the state have different values.
    Mixed {
        /// Exact output value contract.
        contract: ActionStateValueContract,
    },
}

impl ActionStateValue {
    /// Creates an unset observation under an exact contract.
    #[must_use]
    pub const fn unset(contract: ActionStateValueContract) -> Self {
        Self::Unset { contract }
    }

    /// Creates a uniform bounded observation under an exact contract.
    #[must_use]
    pub const fn uniform(contract: ActionStateValueContract, value: ActionValue) -> Self {
        Self::Uniform { contract, value }
    }

    /// Creates a mixed observation under an exact contract.
    #[must_use]
    pub const fn mixed(contract: ActionStateValueContract) -> Self {
        Self::Mixed { contract }
    }

    /// Returns the declared contract when state values are supported.
    #[must_use]
    pub const fn contract(&self) -> Option<&ActionStateValueContract> {
        match self {
            Self::Unsupported => None,
            Self::Unset { contract }
            | Self::Uniform { contract, .. }
            | Self::Mixed { contract } => Some(contract),
        }
    }

    /// Returns the canonical value only for a uniform observation.
    #[must_use]
    pub const fn uniform_value(&self) -> Option<&ActionValue> {
        match self {
            Self::Uniform { value, .. } => Some(value),
            Self::Unsupported | Self::Unset { .. } | Self::Mixed { .. } => None,
        }
    }
}

impl fmt::Debug for ActionStateValue {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Unsupported => formatter.write_str("Unsupported"),
            Self::Unset { contract } => {
                formatter.debug_struct("Unset").field("contract", contract).finish()
            }
            Self::Uniform { contract, .. } => formatter
                .debug_struct("Uniform")
                .field("contract", contract)
                .field("value", &"<redacted>")
                .finish(),
            Self::Mixed { contract } => {
                formatter.debug_struct("Mixed").field("contract", contract).finish()
            }
        }
    }
}

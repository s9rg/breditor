use std::fmt;

use crate::identity::QualifiedName;

use super::{
    error::ActionInputError, id::ActionId, input_version::ActionInputVersion, value::ActionValue,
};

/// Stable versioned identity of one action-input contract.
#[derive(Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct ActionInputContract {
    name: QualifiedName,
    version: ActionInputVersion,
}

impl ActionInputContract {
    /// Creates a contract identity from a validated name and fixed-width version.
    #[must_use]
    pub const fn new(name: QualifiedName, version: ActionInputVersion) -> Self {
        Self { name, version }
    }

    /// Returns the namespaced contract name.
    #[must_use]
    pub const fn name(&self) -> &QualifiedName {
        &self.name
    }

    /// Returns the contract version.
    #[must_use]
    pub const fn version(&self) -> ActionInputVersion {
        self.version
    }
}

impl fmt::Display for ActionInputContract {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(formatter, "{}@{}", self.name, self.version)
    }
}

/// Wire-friendly input supplied to one action invocation.
///
/// [`std::fmt::Debug`] exposes the contract and value kind but redacts the
/// complete typed value payload.
#[derive(Clone, Default, Eq, PartialEq)]
pub enum ActionInput {
    /// The action takes no arguments.
    #[default]
    None,
    /// The action takes one bounded value under a named versioned contract.
    Typed {
        /// Declared input contract.
        contract: ActionInputContract,
        /// Canonical bounded input value.
        value: ActionValue,
    },
}

impl fmt::Debug for ActionInput {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::None => formatter.write_str("None"),
            Self::Typed { contract, value } => formatter
                .debug_struct("Typed")
                .field("contract", contract)
                .field("value_kind", &value.kind())
                .field("value", &"<redacted>")
                .finish(),
        }
    }
}

impl ActionInput {
    /// Creates typed input under an explicit contract.
    #[must_use]
    pub const fn typed(contract: ActionInputContract, value: ActionValue) -> Self {
        Self::Typed { contract, value }
    }

    /// Returns the typed contract, when one is present.
    #[must_use]
    pub const fn contract(&self) -> Option<&ActionInputContract> {
        match self {
            Self::None => None,
            Self::Typed { contract, .. } => Some(contract),
        }
    }

    /// Requires one exact typed contract and returns its canonical value.
    ///
    /// # Errors
    ///
    /// Returns [`ActionInputError`] when input is absent or names another
    /// contract/version.
    pub fn require_typed(
        &self,
        expected: &ActionInputContract,
    ) -> Result<&ActionValue, ActionInputError> {
        match self {
            Self::None => Err(ActionInputError::ExpectedTyped { expected: expected.clone() }),
            Self::Typed { contract, value } if contract == expected => Ok(value),
            Self::Typed { contract, .. } => Err(ActionInputError::ContractMismatch {
                expected: expected.clone(),
                actual: contract.clone(),
            }),
        }
    }
}

pub(crate) fn validate_input_contract(
    expected: Option<&ActionInputContract>,
    input: &ActionInput,
) -> Result<(), ActionInputError> {
    match (expected, input) {
        (None, ActionInput::None) => Ok(()),
        (None, ActionInput::Typed { contract, .. }) => {
            Err(ActionInputError::ExpectedNone { actual: contract.clone() })
        }
        (Some(expected), ActionInput::None) => {
            Err(ActionInputError::ExpectedTyped { expected: expected.clone() })
        }
        (Some(expected), ActionInput::Typed { contract, .. }) if expected == contract => Ok(()),
        (Some(expected), ActionInput::Typed { contract, .. }) => {
            Err(ActionInputError::ContractMismatch {
                expected: expected.clone(),
                actual: contract.clone(),
            })
        }
    }
}

/// Decodes a stable action input into one concrete Rust argument type.
pub trait DecodeActionInput: Sized + Send + Sync + 'static {
    /// Decodes and validates one invocation input.
    ///
    /// Registry dispatch checks the envelope before calling this method, but
    /// the trait is public and direct callers receive no such preflight.
    /// Implementations whose semantics are bound to one contract identity must
    /// therefore compare both `registered_contract` and the input's declared
    /// contract themselves. Built-in versioned decoders do so defensively.
    ///
    /// # Errors
    ///
    /// Returns [`ActionInputError`] when the input contract or value is invalid.
    fn decode(
        registered_contract: Option<&ActionInputContract>,
        input: &ActionInput,
    ) -> Result<Self, ActionInputError>;
}

/// Marker for a decoder that requires a registered typed-input contract.
///
/// [`crate::action::ActionRegistration::with_input`] requires this marker, so a
/// unit/no-input decoder cannot accidentally advertise a typed descriptor.
/// The registry validates the invocation's envelope and exact contract before
/// calling the decoder. A direct-call-safe, version-bound implementation still
/// validates the registered identity, the payload's declared identity, and the
/// contract-specific value rather than depending on that outer preflight.
pub trait TypedActionInput: DecodeActionInput {}

impl DecodeActionInput for () {
    fn decode(
        registered_contract: Option<&ActionInputContract>,
        input: &ActionInput,
    ) -> Result<Self, ActionInputError> {
        if let Some(actual) = registered_contract {
            return Err(ActionInputError::UnexpectedRegisteredContract { actual: actual.clone() });
        }
        match input {
            ActionInput::None => Ok(()),
            ActionInput::Typed { contract, .. } => {
                Err(ActionInputError::ExpectedNone { actual: contract.clone() })
            }
        }
    }
}

/// One immutable request to evaluate a registered action.
///
/// Debug output delegates to the payload-redacting [`ActionInput`] formatter.
#[derive(Clone, Eq, PartialEq)]
pub struct ActionInvocation {
    id: ActionId,
    input: ActionInput,
}

impl fmt::Debug for ActionInvocation {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("ActionInvocation")
            .field("id", &self.id)
            .field("input", &self.input)
            .finish()
    }
}

impl ActionInvocation {
    /// Creates an invocation from an action identity and wire-friendly input.
    #[must_use]
    pub const fn new(id: ActionId, input: ActionInput) -> Self {
        Self { id, input }
    }

    /// Creates an invocation for an action that takes no input.
    #[must_use]
    pub const fn without_input(id: ActionId) -> Self {
        Self { id, input: ActionInput::None }
    }

    /// Returns the requested action identity.
    #[must_use]
    pub const fn id(&self) -> &ActionId {
        &self.id
    }

    /// Returns the supplied input.
    #[must_use]
    pub const fn input(&self) -> &ActionInput {
        &self.input
    }
}

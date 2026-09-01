use thiserror::Error;

use super::{ActionActivation, ActionStateValueContract};

/// Why a handler's observable indicator violated its frozen descriptor.
///
/// Errors retain only shape and contract identities. A rejected uniform value
/// is deliberately not retained, so invalid observations cannot leak payloads
/// through diagnostics or evade later aggregate value accounting.
#[derive(Clone, Debug, Eq, Error, PartialEq)]
pub enum ActionStateValidationError {
    /// A stateless descriptor returned active, inactive, or mixed state.
    #[error("stateless action returned activation {actual:?}")]
    UnexpectedActivation {
        /// Rejected activation shape.
        actual: ActionActivation,
    },
    /// An activation-capable descriptor returned `Stateless`.
    #[error("activation-capable action returned a stateless indicator")]
    MissingActivation,
    /// A descriptor without a value contract returned a typed value state.
    #[error("action without a state value contract returned contract {actual}")]
    UnexpectedValue {
        /// Rejected output contract identity.
        actual: ActionStateValueContract,
    },
    /// A descriptor with a value contract returned `Unsupported`.
    #[error("action declared state value contract {expected}, but returned unsupported")]
    MissingValue {
        /// Required output contract identity.
        expected: ActionStateValueContract,
    },
    /// A typed value state named a different contract or version.
    #[error("action state value contract is {actual}, expected {expected}")]
    ValueContractMismatch {
        /// Required output contract identity.
        expected: ActionStateValueContract,
        /// Returned output contract identity.
        actual: ActionStateValueContract,
    },
}

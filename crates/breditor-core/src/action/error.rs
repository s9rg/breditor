use std::fmt;

use thiserror::Error;

use crate::{identity::QualifiedName, state::SnapshotId, transaction::TransactionApplyError};

use super::{
    capability::{ActionFault, DisabledReason},
    id::ActionId,
    input::ActionInputContract,
    state::{ActionStateDomains, ActionStateValidationError},
};

/// Why a deterministic action value could not be constructed.
#[derive(Clone, Debug, Eq, Error, PartialEq)]
pub enum ActionValueError {
    /// One array or object contains too many direct entries.
    #[error("action-value container has {actual} entries; the limit is {maximum}")]
    ContainerEntries {
        /// Actual direct entry count.
        actual: usize,
        /// Fixed direct entry limit.
        maximum: usize,
    },
    /// The complete value tree is nested too deeply.
    #[error("action-value depth is {actual}; the limit is {maximum}")]
    Depth {
        /// Actual maximum container depth.
        actual: u16,
        /// Fixed depth limit.
        maximum: u16,
    },
    /// The complete tree contains too many values.
    #[error("action-value tree has {actual} values; the limit is {maximum}")]
    ValueCount {
        /// Actual scalar and container count.
        actual: u32,
        /// Fixed value-count limit.
        maximum: u32,
    },
    /// String payloads and object keys exceed the aggregate byte budget.
    #[error("action-value text uses {actual} UTF-8 bytes; the limit is {maximum}")]
    TextBytes {
        /// Actual aggregate text bytes.
        actual: u64,
        /// Fixed aggregate text-byte limit.
        maximum: u64,
    },
    /// An object key is empty.
    #[error("an action-value object key cannot be empty")]
    EmptyObjectKey,
    /// An object key exceeds its fixed byte limit.
    #[error("action-value object key is {actual} bytes; the limit is {maximum}")]
    ObjectKeyTooLong {
        /// Actual key length.
        actual: usize,
        /// Fixed key length limit.
        maximum: usize,
    },
    /// An object key starts with an unsupported character.
    #[error("action-value object key `{key}` must begin with an ASCII letter or `_`")]
    InvalidObjectKeyStart {
        /// Rejected key.
        key: String,
    },
    /// An object key contains an unsupported character.
    #[error(
        "action-value object key `{key}` has invalid character `{character}` at byte {byte_index}"
    )]
    InvalidObjectKeyCharacter {
        /// Rejected key.
        key: String,
        /// Byte index of the invalid character.
        byte_index: usize,
        /// Invalid character.
        character: char,
    },
    /// An object supplied the same key more than once.
    #[error("action-value object key `{key}` occurs more than once")]
    DuplicateObjectKey {
        /// Duplicated key.
        key: String,
    },
}

/// Why a wire-friendly invocation input could not become one action's Rust input.
#[derive(Clone, Debug, Eq, Error, PartialEq)]
pub enum ActionInputError {
    /// A typed decoder was invoked without its registered contract.
    #[error("typed action decoder has no registered input contract")]
    MissingRegisteredContract,
    /// A no-input decoder was invoked with a typed contract.
    #[error("no-input action decoder was registered with contract {actual}")]
    UnexpectedRegisteredContract {
        /// Unexpected registered contract.
        actual: ActionInputContract,
    },
    /// A no-input action received a typed value.
    #[error("action expects no input, but received contract {actual}")]
    ExpectedNone {
        /// Unexpected input contract.
        actual: ActionInputContract,
    },
    /// A typed action received no input.
    #[error("action expects input contract {expected}, but received no input")]
    ExpectedTyped {
        /// Required input contract.
        expected: ActionInputContract,
    },
    /// A typed input declared a different contract.
    #[error("action expects input contract {expected}, but received {actual}")]
    ContractMismatch {
        /// Required input contract.
        expected: ActionInputContract,
        /// Supplied input contract.
        actual: ActionInputContract,
    },
    /// The contract matched, but its value did not satisfy action-defined rules.
    #[error("action input violates rule {code}")]
    InvalidValue {
        /// Stable namespaced input-rule code.
        code: QualifiedName,
    },
}

/// Why an immutable action registry could not be built.
#[derive(Clone, Debug, Eq, Error, PartialEq)]
pub enum ActionRegistryError {
    /// Two registrations claimed one identity; neither wins.
    #[error("action {id} is registered more than once")]
    DuplicateActionId {
        /// Conflicting action identity.
        id: ActionId,
    },
    /// An ordinary action claimed to read session history it cannot observe.
    #[error("action {id} cannot declare the HISTORY read domain")]
    UnsupportedHistoryRead {
        /// Lexically first invalid action identity.
        id: ActionId,
    },
}

/// Why an enabled action plan failed exact transaction preflight.
///
/// Debug output retains stable categories and domain sets but never formats a
/// transaction failure's document-bearing source fields.
#[derive(Clone, Eq, Error, PartialEq)]
pub enum InvalidActionPlan {
    /// Applying the generated exact-base transaction failed.
    #[error("generated transaction failed preflight: {source}")]
    Transaction {
        /// Exact transaction failure.
        source: Box<TransactionApplyError>,
    },
    /// The handler called the action enabled but produced no state change.
    #[error("enabled action plan produced an unchanged transaction")]
    Unchanged,
    /// The successful preflight changed a domain outside the advertised effects.
    #[error("enabled action changed {actual:?}, outside declared writes {declared:?}")]
    UndeclaredWrites {
        /// Frozen domains the action advertised as possible writes.
        declared: ActionStateDomains,
        /// Domains actually changed by the preflighted commit.
        actual: ActionStateDomains,
    },
}

impl fmt::Debug for InvalidActionPlan {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Transaction { source } => formatter
                .debug_struct("Transaction")
                .field("category", &transaction_apply_error_category(source))
                .finish_non_exhaustive(),
            Self::Unchanged => formatter.write_str("Unchanged"),
            Self::UndeclaredWrites { declared, actual } => formatter
                .debug_struct("UndeclaredWrites")
                .field("declared", declared)
                .field("actual", actual)
                .finish(),
        }
    }
}

/// Why an action invocation could not be prepared.
///
/// Debug output retains action identities, safe contracts, and stable failure
/// categories while redacting handler details and document-bearing plan errors.
#[derive(Clone, Eq, Error, PartialEq)]
pub enum ActionPrepareError {
    /// No handler owns the requested action identity.
    #[error("action {id} is not registered")]
    UnknownAction {
        /// Missing action identity.
        id: ActionId,
    },
    /// The invocation input failed the registered typed decoder.
    #[error("action {id} rejected its input: {source}")]
    InvalidInput {
        /// Invoked action identity.
        id: ActionId,
        /// Typed input failure.
        source: ActionInputError,
    },
    /// The registered handler reported an unexpected deterministic fault.
    #[error("action {id} failed while evaluating: {source}")]
    Fault {
        /// Invoked action identity.
        id: ActionId,
        /// Stable handler fault.
        source: ActionFault,
    },
    /// The handler returned an indicator that violated its frozen descriptor.
    #[error("action {id} returned invalid observable state: {source}")]
    InvalidState {
        /// Invoked action identity.
        id: ActionId,
        /// Exact shape or output-contract mismatch.
        source: ActionStateValidationError,
    },
    /// An enabled plan failed exact transaction preflight.
    #[error("action {id} produced an invalid plan: {source}")]
    InvalidPlan {
        /// Invoked action identity.
        id: ActionId,
        /// Exact plan failure.
        source: InvalidActionPlan,
    },
}

impl fmt::Debug for ActionPrepareError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::UnknownAction { id } => {
                formatter.debug_struct("UnknownAction").field("id", id).finish()
            }
            Self::InvalidInput { id, source } => formatter
                .debug_struct("InvalidInput")
                .field("id", id)
                .field("source", source)
                .finish(),
            Self::Fault { id, source } => formatter
                .debug_struct("Fault")
                .field("id", id)
                .field("fault_code", source.code())
                .finish_non_exhaustive(),
            Self::InvalidState { id, source } => formatter
                .debug_struct("InvalidState")
                .field("id", id)
                .field("source", source)
                .finish(),
            Self::InvalidPlan { id, source } => formatter
                .debug_struct("InvalidPlan")
                .field("id", id)
                .field("source", source)
                .finish_non_exhaustive(),
        }
    }
}

fn transaction_apply_error_category(error: &TransactionApplyError) -> &'static str {
    match error {
        TransactionApplyError::ContextSchemaMismatch { .. } => "context-schema-mismatch",
        TransactionApplyError::ContextConfigurationMismatch => "context-configuration-mismatch",
        TransactionApplyError::StaleSnapshot { .. } => "stale-snapshot",
        TransactionApplyError::BaseStateMismatch { .. } => "base-state-mismatch",
        TransactionApplyError::OperationLimit { .. } => "operation-limit",
        TransactionApplyError::Operation { .. } => "operation",
        TransactionApplyError::SelectionRelocation(_) => "selection-relocation",
        TransactionApplyError::InvalidResultState(_) => "invalid-result-state",
        TransactionApplyError::Revision(_) => "revision",
    }
}

/// Why a cached prepared action cannot be consumed against a supplied state.
#[derive(Clone, Debug, Eq, Error, PartialEq)]
pub enum PreparedActionExecutionError {
    /// The state has advanced or belongs to another lineage.
    #[error("prepared action expects snapshot {expected:?}, got {actual:?}")]
    StaleSnapshot {
        /// Snapshot used during preflight.
        expected: SnapshotId,
        /// Supplied current snapshot.
        actual: SnapshotId,
    },
    /// A caller reused the snapshot identity for different state content.
    #[error(
        "prepared action base state does not equal the supplied state at snapshot {snapshot:?}"
    )]
    BaseStateMismatch {
        /// Reused snapshot identity.
        snapshot: SnapshotId,
    },
}

/// Why an action preparation cannot execute.
#[derive(Clone, Debug, Eq, Error, PartialEq)]
pub enum ActionExecutionError {
    /// Capability evaluation deliberately disabled the action.
    #[error("action is disabled by rule {reason:?}")]
    Disabled {
        /// Exact disabled reason returned during preparation.
        reason: DisabledReason,
    },
    /// The state no longer matches the enabled preparation.
    #[error(transparent)]
    Prepared(#[from] PreparedActionExecutionError),
}

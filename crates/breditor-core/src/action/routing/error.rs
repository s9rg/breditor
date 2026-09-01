use thiserror::Error;

use crate::action::{ActionId, ActionInputContract, ActionInputError, ActionPrepareError};

use super::{BindingId, BindingPriority, IntentBinding, IntentId};

/// Why an immutable semantic intent router could not be built.
///
/// Construction validates sorted declarations and bindings in fixed phases, so
/// the returned failure is independent of caller registration order.
#[derive(Clone, Debug, Eq, Error, PartialEq)]
pub enum IntentRouterError {
    /// The declaration graph exceeds its fixed intent-count bound.
    #[error("intent declaration count is {actual}; the maximum is {maximum}")]
    TooManyIntentDeclarations {
        /// Rejected fixed-width declaration count.
        actual: u32,
        /// Fixed maximum declaration count.
        maximum: u32,
    },
    /// The declaration graph exceeds its fixed total binding-count bound.
    #[error("intent binding count is {actual}; the maximum is {maximum}")]
    TooManyIntentBindings {
        /// Rejected fixed-width total binding count.
        actual: u32,
        /// Fixed maximum total binding count.
        maximum: u32,
    },
    /// One intent exceeds its fixed route-depth bound.
    #[error("intent {intent} has {actual} bindings; the maximum is {maximum}")]
    TooManyBindingsForIntent {
        /// Lexically first over-limit semantic intent.
        intent: IntentId,
        /// Rejected fixed-width per-intent binding count.
        actual: u32,
        /// Fixed maximum bindings per intent.
        maximum: u32,
    },
    /// Two declarations claimed one intent identity.
    #[error("intent {id} is declared more than once")]
    DuplicateIntentId {
        /// Conflicting intent identity.
        id: IntentId,
    },
    /// Two bindings claimed one global binding identity.
    #[error("intent binding {id} is declared more than once")]
    DuplicateBindingId {
        /// Conflicting binding identity.
        id: BindingId,
    },
    /// A binding referred to an undeclared semantic intent.
    #[error("binding {binding} refers to undeclared intent {intent}")]
    UnknownIntent {
        /// Invalid binding identity.
        binding: BindingId,
        /// Missing intent declaration.
        intent: IntentId,
    },
    /// A binding referred to an action absent from the frozen action registry.
    #[error("binding {binding} refers to unregistered action {action}")]
    UnknownAction {
        /// Invalid binding identity.
        binding: BindingId,
        /// Missing action identity.
        action: ActionId,
    },
    /// A target action's input contract differed from its intent declaration.
    #[error("binding {binding} action {action} does not match intent {intent} input contract")]
    InputContractMismatch {
        /// Declared semantic intent.
        intent: IntentId,
        /// Invalid binding identity.
        binding: BindingId,
        /// Mismatched action identity.
        action: ActionId,
        /// Exact contract declared by the intent.
        expected: Option<ActionInputContract>,
        /// Exact contract advertised by the action.
        actual: Option<ActionInputContract>,
    },
    /// Two bindings under one intent used an equal priority.
    #[error("intent {intent} has more than one binding at priority {priority}")]
    DuplicatePriority {
        /// Conflicting semantic intent.
        intent: IntentId,
        /// Equal priority that would require a hidden tie-breaker.
        priority: BindingPriority,
        /// Lexically first two conflicting binding identities.
        bindings: [BindingId; 2],
    },
    /// Two bindings under one intent targeted the same action.
    #[error("intent {intent} binds action {action} more than once")]
    DuplicateAction {
        /// Conflicting semantic intent.
        intent: IntentId,
        /// Repeated target action.
        action: ActionId,
        /// Lexically first two conflicting binding identities.
        bindings: [BindingId; 2],
    },
}

/// Why routing one semantic intent failed before producing an outcome.
///
/// Expected action inapplicability is represented by unhandled or blocked route
/// outcomes. This error is reserved for undeclared intents, malformed input,
/// action faults, and invalid action plans; none permit fallback.
#[derive(Clone, Debug, Eq, Error, PartialEq)]
pub enum IntentRouteError {
    /// The invocation named an intent absent from the frozen router.
    #[error("intent {intent} is not declared")]
    UnknownIntent {
        /// Missing semantic intent identity.
        intent: IntentId,
    },
    /// The invocation envelope differed from the intent's shared contract.
    #[error("intent {intent} rejected its input: {source}")]
    InvalidInput {
        /// Invoked semantic intent.
        intent: IntentId,
        /// Exact envelope mismatch.
        source: ActionInputError,
    },
    /// One candidate action failed while being prepared.
    #[error("intent {intent} binding {binding} action {action} failed during routing: {source}")]
    Action {
        /// Invoked semantic intent.
        intent: IntentId,
        /// Candidate binding being evaluated.
        binding: BindingId,
        /// Candidate action being prepared.
        action: ActionId,
        /// Terminal action preparation failure.
        source: Box<ActionPrepareError>,
    },
}

/// Why an evaluated semantic route no longer matches the supplied current state.
#[derive(Clone, Debug, Eq, Error, PartialEq)]
pub enum IntentRouteBaseError {
    /// The current state has advanced or belongs to another lineage.
    #[error("intent {intent} route expects snapshot {expected:?}, got {actual:?}")]
    StaleSnapshot {
        /// Routed semantic intent.
        intent: IntentId,
        /// Selected or blocking binding, when the outcome reached one.
        binding: Option<Box<IntentBinding>>,
        /// Snapshot used during routing.
        expected: crate::state::SnapshotId,
        /// Supplied current snapshot.
        actual: crate::state::SnapshotId,
    },
    /// A caller reused the routed snapshot identity for different state content.
    #[error("intent {intent} route base does not equal current state at snapshot {snapshot:?}")]
    BaseStateMismatch {
        /// Routed semantic intent.
        intent: IntentId,
        /// Selected or blocking binding, when the outcome reached one.
        binding: Option<Box<IntentBinding>>,
        /// Reused snapshot identity.
        snapshot: crate::state::SnapshotId,
    },
}

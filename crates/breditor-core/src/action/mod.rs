//! Deterministic extensible actions that produce exact-base transactions.
//!
//! The action layer owns no DOM, key event, toolbar presentation, clock, async
//! runtime, or mutable editor state. A frozen registry evaluates pure typed
//! handlers against immutable [`crate::state::EditorState`] values and funnels
//! every enabled plan through the authoritative transaction reducer.
//! Ordinary handlers receive editor state but not session history, so frozen
//! action and intent construction rejects history-read declarations.
//!
//! A separate semantic router adds explicit priority and disabled fallback over
//! the registry without introducing host event syntax. The same evaluation owns
//! capability plus typed active/mixed/value observation, while a frozen catalog
//! derives presentation-independent read batches. Labels, icons, layout, and
//! plugin lifecycle remain separate contracts.

pub mod builtins;
pub mod routing;
pub mod state;

mod capability;
mod error;
mod handler;
mod id;
mod input;
mod input_version;
mod plan;
mod registry;
mod text_position;
mod value;

pub use capability::{
    ActionDecision, ActionFault, ActionPreparation, Capability, DisabledActionPreparation,
    DisabledReason, PreparedAction,
};
pub use error::{
    ActionExecutionError, ActionInputError, ActionPrepareError, ActionRegistryError,
    ActionValueError, InvalidActionPlan, PreparedActionExecutionError,
};
pub use handler::{Action, ActionDescriptor, ActionRegistration};
pub use id::ActionId;
pub use input::{
    ActionInput, ActionInputContract, ActionInvocation, DecodeActionInput, TypedActionInput,
};
pub use input_version::{ActionInputVersion, ActionInputVersionError};
pub use plan::ActionPlan;
pub use registry::ActionRegistry;
pub use state::{
    ActionActivation, ActionActivationContract, ActionEffects, ActionEvaluation,
    ActionStateActionFault, ActionStateBatch, ActionStateBatchSummary, ActionStateCache,
    ActionStateCacheUpdate, ActionStateCatalog, ActionStateCatalogError, ActionStateContract,
    ActionStateDelta, ActionStateDeriveError, ActionStateDescriptor, ActionStateDomains,
    ActionStateEntry, ActionStateFault, ActionStateHistoryBoundaryFault, ActionStateHistoryFault,
    ActionStateId, ActionStateIndicator, ActionStateObservation, ActionStateObservationId,
    ActionStateOperationFault, ActionStateOutcome, ActionStatePlanFault, ActionStateProvenance,
    ActionStateRegistration, ActionStateRelocationFault, ActionStateResourceError,
    ActionStateResultFault, ActionStateRouteFault, ActionStateSelectionRelocationFault,
    ActionStateSource, ActionStateSpec, ActionStateTransactionFault, ActionStateValidationError,
    ActionStateValue, ActionStateValueContract, ActionStateValueVersion,
    ActionStateValueVersionError, MAX_ACTION_STATE_BATCH_FALLTHROUGHS,
    MAX_ACTION_STATE_BATCH_TEXT_BYTES, MAX_ACTION_STATE_BATCH_VALUE_COUNT,
    MAX_ACTION_STATE_ENTRIES, MAX_ACTION_STATE_ENTRY_TEXT_BYTES,
    MAX_ACTION_STATE_ENTRY_VALUE_COUNT, MAX_ACTION_STATE_INPUT_TEXT_BYTES,
    MAX_ACTION_STATE_INPUT_VALUE_COUNT, ObservedAvailability, ResolvedActionState,
    UnhandledActionState,
};
pub use value::{
    ActionObject, ActionObjectIter, ActionValue, ActionValueKind, ActionValueSummary,
    MAX_ACTION_VALUE_CONTAINER_ENTRIES, MAX_ACTION_VALUE_COUNT, MAX_ACTION_VALUE_DEPTH,
    MAX_ACTION_VALUE_OBJECT_KEY_BYTES, MAX_ACTION_VALUE_TEXT_BYTES,
};

//! Deterministic extensible actions that produce exact-base transactions.
//!
//! The action layer owns no DOM, key event, toolbar presentation, clock, async
//! runtime, or mutable editor state. A frozen registry evaluates pure typed
//! handlers against immutable [`crate::state::EditorState`] values and funnels
//! every enabled plan through the authoritative transaction reducer.
//!
//! A separate semantic router adds explicit priority and disabled fallback over
//! the registry without introducing host event syntax. Active/mixed toolbar
//! state, labels, icons, and plugin lifecycle remain separate contracts rather
//! than implicit registration-order behavior.

pub mod builtins;
pub mod routing;

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
pub use value::{
    ActionObject, ActionObjectIter, ActionValue, ActionValueKind, ActionValueSummary,
    MAX_ACTION_VALUE_CONTAINER_ENTRIES, MAX_ACTION_VALUE_COUNT, MAX_ACTION_VALUE_DEPTH,
    MAX_ACTION_VALUE_OBJECT_KEY_BYTES, MAX_ACTION_VALUE_TEXT_BYTES,
};

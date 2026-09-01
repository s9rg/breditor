use std::{fmt, sync::Arc};

use crate::state::EditorState;

use super::{
    capability::{ActionDecision, ActionFault},
    error::ActionInputError,
    id::ActionId,
    input::{
        ActionInput, ActionInputContract, DecodeActionInput, TypedActionInput,
        validate_input_contract,
    },
};

/// Pure typed action handler compiled into the Rust core or Wasm module.
pub trait Action: Send + Sync + 'static {
    /// Concrete decoded input accepted by this action.
    type Input: DecodeActionInput;

    /// Evaluates capability and, when enabled, produces a complete action plan.
    ///
    /// Implementations must be deterministic and side-effect free. Expected
    /// state/input inapplicability belongs in [`ActionDecision::Disabled`];
    /// unexpected deterministic failures use [`ActionFault`].
    ///
    /// # Errors
    ///
    /// Returns [`ActionFault`] for an unexpected action-defined evaluation failure.
    fn evaluate(
        &self,
        state: &EditorState,
        input: &Self::Input,
    ) -> Result<ActionDecision, ActionFault>;
}

/// Stable registry metadata exposed without exposing an erased handler.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ActionDescriptor {
    id: ActionId,
    input_contract: Option<ActionInputContract>,
}

impl ActionDescriptor {
    /// Returns the registered action identity.
    #[must_use]
    pub const fn id(&self) -> &ActionId {
        &self.id
    }

    /// Returns the required typed input contract, or `None` for no input.
    #[must_use]
    pub const fn input_contract(&self) -> Option<&ActionInputContract> {
        self.input_contract.as_ref()
    }
}

/// One typed action registration before immutable registry construction.
pub struct ActionRegistration {
    pub(crate) descriptor: ActionDescriptor,
    pub(crate) handler: Arc<dyn ErasedAction>,
}

impl ActionRegistration {
    /// Erases one no-input typed handler behind a stable descriptor.
    #[must_use]
    pub fn new<A>(id: ActionId, action: A) -> Self
    where
        A: Action<Input = ()>,
    {
        Self::from_parts(id, None, action)
    }

    /// Erases one no-input typed handler behind a stable descriptor.
    #[must_use]
    pub fn without_input<A>(id: ActionId, action: A) -> Self
    where
        A: Action<Input = ()>,
    {
        Self::new(id, action)
    }

    /// Erases one typed-input handler behind a stable descriptor.
    #[must_use]
    pub fn with_input<A>(id: ActionId, contract: ActionInputContract, action: A) -> Self
    where
        A: Action,
        A::Input: TypedActionInput,
    {
        Self::from_parts(id, Some(contract), action)
    }

    fn from_parts<A>(id: ActionId, input_contract: Option<ActionInputContract>, action: A) -> Self
    where
        A: Action,
    {
        Self {
            descriptor: ActionDescriptor { id, input_contract: input_contract.clone() },
            handler: Arc::new(TypedAction { action, input_contract }),
        }
    }

    /// Returns registration metadata.
    #[must_use]
    pub const fn descriptor(&self) -> &ActionDescriptor {
        &self.descriptor
    }
}

impl fmt::Debug for ActionRegistration {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("ActionRegistration")
            .field("descriptor", &self.descriptor)
            .finish_non_exhaustive()
    }
}

pub(crate) trait ErasedAction: Send + Sync {
    fn evaluate(
        &self,
        state: &EditorState,
        input: &ActionInput,
    ) -> Result<ActionDecision, ErasedActionError>;
}

struct TypedAction<A> {
    action: A,
    input_contract: Option<ActionInputContract>,
}

impl<A> ErasedAction for TypedAction<A>
where
    A: Action,
{
    fn evaluate(
        &self,
        state: &EditorState,
        input: &ActionInput,
    ) -> Result<ActionDecision, ErasedActionError> {
        validate_input_contract(self.input_contract.as_ref(), input)
            .map_err(ErasedActionError::Input)?;
        let input = A::Input::decode(self.input_contract.as_ref(), input)
            .map_err(ErasedActionError::Input)?;
        self.action.evaluate(state, &input).map_err(ErasedActionError::Fault)
    }
}

pub(crate) enum ErasedActionError {
    Input(ActionInputError),
    Fault(ActionFault),
}

use thiserror::Error;

use crate::{
    identity::QualifiedName,
    state::{EditorState, SnapshotId},
    transaction::{Commit, Transaction},
};

use super::{
    error::{ActionExecutionError, PreparedActionExecutionError},
    id::ActionId,
    plan::ActionPlan,
    value::ActionValue,
};

/// Stable expected reason an action is unavailable in one exact state.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DisabledReason {
    code: QualifiedName,
    detail: Option<ActionValue>,
}

impl DisabledReason {
    /// Creates a disabled reason from a namespaced code and optional bounded detail.
    #[must_use]
    pub const fn new(code: QualifiedName, detail: Option<ActionValue>) -> Self {
        Self { code, detail }
    }

    /// Returns the stable namespaced reason code.
    #[must_use]
    pub const fn code(&self) -> &QualifiedName {
        &self.code
    }

    /// Returns optional machine-readable detail.
    #[must_use]
    pub const fn detail(&self) -> Option<&ActionValue> {
        self.detail.as_ref()
    }
}

/// Stable unexpected fault reported by an action handler.
#[derive(Clone, Debug, Eq, Error, PartialEq)]
#[error("action handler fault {code}")]
pub struct ActionFault {
    code: QualifiedName,
    detail: Option<ActionValue>,
}

impl ActionFault {
    /// Creates a handler fault from a namespaced code and optional bounded detail.
    #[must_use]
    pub const fn new(code: QualifiedName, detail: Option<ActionValue>) -> Self {
        Self { code, detail }
    }

    /// Returns the stable namespaced fault code.
    #[must_use]
    pub const fn code(&self) -> &QualifiedName {
        &self.code
    }

    /// Returns optional machine-readable detail.
    #[must_use]
    pub const fn detail(&self) -> Option<&ActionValue> {
        self.detail.as_ref()
    }
}

/// Pure result of evaluating one typed action handler.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ActionDecision {
    /// The action is expectedly unavailable in the supplied state/input.
    Disabled(DisabledReason),
    /// The action can produce this complete transaction recipe.
    Enabled(ActionPlan),
}

/// Toolbar-facing availability derived from the sole preparation path.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum Capability {
    /// Preparation produced one exact preflighted commit.
    Enabled,
    /// Preparation returned one stable expected disabled reason.
    Disabled(DisabledReason),
}

/// One disabled decision bound to the exact state on which it was evaluated.
///
/// Disabled preparations are state-local for the same reason enabled
/// preparations are: a later state may make the action available. Consuming a
/// cached disabled result against any other state is therefore rejected.
#[must_use = "a disabled preparation must be inspected or discarded explicitly"]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DisabledActionPreparation {
    id: ActionId,
    base: Box<EditorState>,
    reason: DisabledReason,
}

impl DisabledActionPreparation {
    pub(crate) fn new(id: ActionId, base: EditorState, reason: DisabledReason) -> Self {
        Self { id, base: Box::new(base), reason }
    }

    /// Returns the evaluated action identity.
    #[must_use]
    pub const fn id(&self) -> &ActionId {
        &self.id
    }

    /// Returns the exact state used for capability evaluation.
    #[must_use]
    pub const fn base_state(&self) -> &EditorState {
        &self.base
    }

    /// Returns the stable expected unavailability reason.
    #[must_use]
    pub const fn reason(&self) -> &DisabledReason {
        &self.reason
    }

    pub(crate) fn into_base_and_reason(self) -> (EditorState, DisabledReason) {
        (*self.base, self.reason)
    }

    fn execute(self, current: &EditorState) -> Result<Commit, ActionExecutionError> {
        validate_prepared_base(&self.base, current)?;
        Err(ActionExecutionError::Disabled { reason: self.reason })
    }
}

/// One exact-base transaction and its cached successful preflight commit.
///
/// This value is deliberately one-shot and not cloneable. Execution never calls
/// the action handler or transaction reducer again.
#[must_use = "a prepared action must be executed or discarded explicitly"]
#[derive(Debug, Eq, PartialEq)]
pub struct PreparedAction {
    id: ActionId,
    transaction: Box<Transaction>,
    commit: Box<Commit>,
}

impl PreparedAction {
    pub(crate) fn new(id: ActionId, transaction: Transaction, commit: Box<Commit>) -> Self {
        Self { id, transaction: Box::new(transaction), commit }
    }

    /// Returns the prepared action identity.
    #[must_use]
    pub const fn id(&self) -> &ActionId {
        &self.id
    }

    /// Returns the exact generated transaction for inspection.
    #[must_use]
    pub const fn transaction(&self) -> &Transaction {
        &self.transaction
    }

    /// Returns the exact preflight base snapshot.
    #[must_use]
    pub const fn base_snapshot(&self) -> &SnapshotId {
        self.transaction.base_snapshot()
    }

    /// Returns the exact preflight base state.
    #[must_use]
    pub const fn base_state(&self) -> &EditorState {
        self.transaction.base_state()
    }

    /// Consumes the cached commit after verifying the exact current state.
    ///
    /// # Errors
    ///
    /// Returns [`PreparedActionExecutionError`] when the supplied state has a
    /// different snapshot or reuses the snapshot for different state content.
    pub fn execute(self, current: &EditorState) -> Result<Commit, PreparedActionExecutionError> {
        validate_prepared_base(self.transaction.base_state(), current)?;
        Ok(*self.commit)
    }
}

/// Complete result of evaluating and preflighting one action invocation.
#[must_use = "action preparation must be inspected or executed"]
#[derive(Debug, Eq, PartialEq)]
pub enum ActionPreparation {
    /// The handler expectedly disabled the action.
    Disabled(DisabledActionPreparation),
    /// The handler produced one successfully preflighted exact-base transaction.
    Enabled(PreparedAction),
}

impl ActionPreparation {
    /// Returns the evaluated action identity for either capability outcome.
    #[must_use]
    pub const fn id(&self) -> &ActionId {
        match self {
            Self::Disabled(prepared) => prepared.id(),
            Self::Enabled(prepared) => prepared.id(),
        }
    }

    /// Returns the exact state on which this capability was evaluated.
    #[must_use]
    pub const fn base_state(&self) -> &EditorState {
        match self {
            Self::Disabled(prepared) => prepared.base_state(),
            Self::Enabled(prepared) => prepared.base_state(),
        }
    }

    /// Returns the exact snapshot on which this capability was evaluated.
    #[must_use]
    pub const fn base_snapshot(&self) -> &SnapshotId {
        self.base_state().snapshot()
    }

    /// Returns toolbar-facing capability without evaluating the handler again.
    #[must_use]
    pub fn capability(&self) -> Capability {
        match self {
            Self::Disabled(prepared) => Capability::Disabled(prepared.reason().clone()),
            Self::Enabled(_) => Capability::Enabled,
        }
    }

    /// Consumes this preparation, returning its cached commit when enabled.
    ///
    /// # Errors
    ///
    /// Returns [`ActionExecutionError`] with the exact disabled reason or when
    /// the current state no longer matches the prepared base.
    pub fn execute(self, current: &EditorState) -> Result<Commit, ActionExecutionError> {
        match self {
            Self::Disabled(prepared) => prepared.execute(current),
            Self::Enabled(prepared) => prepared.execute(current).map_err(Into::into),
        }
    }
}

pub(crate) fn validate_prepared_base(
    expected: &EditorState,
    current: &EditorState,
) -> Result<(), PreparedActionExecutionError> {
    if current.snapshot() != expected.snapshot() {
        return Err(PreparedActionExecutionError::StaleSnapshot {
            expected: expected.snapshot().clone(),
            actual: current.snapshot().clone(),
        });
    }
    if current != expected {
        return Err(PreparedActionExecutionError::BaseStateMismatch {
            snapshot: current.snapshot().clone(),
        });
    }
    Ok(())
}

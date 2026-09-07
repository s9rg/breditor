use std::fmt;

use crate::{
    action::{
        ActionId, ActionPreparation, ActionStateDomains, ActionStateIndicator,
        DisabledActionPreparation, DisabledReason, PreparedAction, PreparedActionExecutionError,
        capability::validate_prepared_base,
    },
    state::{EditorState, SnapshotId},
};

use super::{
    BindingId, BindingPriority, IntentBinding, IntentExecutionOutcome, IntentFallThrough, IntentId,
    IntentRouteBaseError,
};

/// A declared intent for which every evaluated binding fell through.
#[must_use = "an unhandled intent must be inspected or discarded explicitly"]
#[derive(Eq, PartialEq)]
pub struct UnhandledIntent {
    intent_id: IntentId,
    base: Box<EditorState>,
    fallthroughs: Box<[IntentFallThrough]>,
}

impl UnhandledIntent {
    pub(crate) fn new(
        intent_id: IntentId,
        base: EditorState,
        fallthroughs: Vec<IntentFallThrough>,
    ) -> Self {
        Self { intent_id, base: Box::new(base), fallthroughs: fallthroughs.into_boxed_slice() }
    }

    /// Returns the declared semantic intent.
    #[must_use]
    pub const fn intent_id(&self) -> &IntentId {
        &self.intent_id
    }

    /// Returns the exact state against which routing ran.
    #[must_use]
    pub const fn base_state(&self) -> &EditorState {
        &self.base
    }

    /// Returns the exact snapshot against which routing ran.
    #[must_use]
    pub const fn base_snapshot(&self) -> &SnapshotId {
        self.base.snapshot()
    }

    /// Returns every disabled candidate in priority evaluation order.
    #[must_use]
    pub const fn fallthroughs(&self) -> &[IntentFallThrough] {
        &self.fallthroughs
    }
}

impl fmt::Debug for UnhandledIntent {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("UnhandledIntent")
            .field("intent_id", &self.intent_id)
            .field("base_snapshot", &self.base_snapshot())
            .field("fallthroughs", &self.fallthroughs)
            .finish_non_exhaustive()
    }
}

/// A declared intent stopped by one expected-disabled blocking binding.
#[must_use = "a blocked intent must be inspected or discarded explicitly"]
#[derive(Eq, PartialEq)]
pub struct BlockedIntent {
    intent_id: IntentId,
    binding: IntentBinding,
    preparation: DisabledActionPreparation,
    fallthroughs: Box<[IntentFallThrough]>,
}

impl BlockedIntent {
    pub(crate) fn new(
        intent_id: IntentId,
        binding: IntentBinding,
        preparation: DisabledActionPreparation,
        fallthroughs: Vec<IntentFallThrough>,
    ) -> Self {
        Self { intent_id, binding, preparation, fallthroughs: fallthroughs.into_boxed_slice() }
    }

    /// Returns the declared semantic intent.
    #[must_use]
    pub const fn intent_id(&self) -> &IntentId {
        &self.intent_id
    }

    /// Returns the exact binding that blocked fallback.
    #[must_use]
    pub const fn binding(&self) -> &IntentBinding {
        &self.binding
    }

    /// Returns the blocking binding identity.
    #[must_use]
    pub const fn binding_id(&self) -> &BindingId {
        self.binding.id()
    }

    /// Returns the expectedly disabled action identity.
    #[must_use]
    pub const fn action_id(&self) -> &ActionId {
        self.binding.action_id()
    }

    /// Returns the blocking binding priority.
    #[must_use]
    pub const fn priority(&self) -> BindingPriority {
        self.binding.priority()
    }

    /// Returns the exact state against which routing ran.
    #[must_use]
    pub const fn base_state(&self) -> &EditorState {
        self.preparation.base_state()
    }

    /// Returns the exact snapshot against which routing ran.
    #[must_use]
    pub const fn base_snapshot(&self) -> &SnapshotId {
        self.preparation.base_state().snapshot()
    }

    /// Returns the exact expected-disabled reason that stopped routing.
    #[must_use]
    pub const fn reason(&self) -> &DisabledReason {
        self.preparation.reason()
    }

    /// Returns the complete disabled action preparation that stopped routing.
    pub const fn disabled_preparation(&self) -> &DisabledActionPreparation {
        &self.preparation
    }

    /// Returns activation and optional typed value from the blocking evaluation.
    #[must_use]
    pub const fn indicator(&self) -> &ActionStateIndicator {
        self.preparation.indicator()
    }

    /// Returns earlier disabled candidates in priority evaluation order.
    #[must_use]
    pub const fn fallthroughs(&self) -> &[IntentFallThrough] {
        &self.fallthroughs
    }
}

impl fmt::Debug for BlockedIntent {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("BlockedIntent")
            .field("intent_id", &self.intent_id)
            .field("binding", &self.binding)
            .field("base_snapshot", &self.base_snapshot())
            .field("reason_code", &self.reason().code())
            .field("indicator", &self.indicator())
            .field("fallthroughs", &self.fallthroughs)
            .finish_non_exhaustive()
    }
}

/// One routed binding and its cached exact-state prepared action.
///
/// The action handler and transaction reducer already ran exactly once. Turning
/// this value into an [`ActionPreparation`] or executing its route never runs
/// either again.
#[must_use = "a routed action must be executed or discarded explicitly"]
#[derive(Eq, PartialEq)]
pub struct RoutedAction {
    intent_id: IntentId,
    binding: IntentBinding,
    prepared: PreparedAction,
    fallthroughs: Box<[IntentFallThrough]>,
}

impl RoutedAction {
    pub(crate) fn new(
        intent_id: IntentId,
        binding: IntentBinding,
        prepared: PreparedAction,
        fallthroughs: Vec<IntentFallThrough>,
    ) -> Self {
        Self { intent_id, binding, prepared, fallthroughs: fallthroughs.into_boxed_slice() }
    }

    /// Returns the declared semantic intent.
    #[must_use]
    pub const fn intent_id(&self) -> &IntentId {
        &self.intent_id
    }

    /// Returns the binding that selected this action.
    #[must_use]
    pub const fn binding(&self) -> &IntentBinding {
        &self.binding
    }

    /// Returns the selected binding identity.
    #[must_use]
    pub const fn binding_id(&self) -> &BindingId {
        self.binding.id()
    }

    /// Returns the selected action identity.
    #[must_use]
    pub const fn action_id(&self) -> &ActionId {
        self.prepared.id()
    }

    /// Returns the selected binding priority.
    #[must_use]
    pub const fn priority(&self) -> BindingPriority {
        self.binding.priority()
    }

    /// Returns the exact generated transaction and cached preflight result.
    pub const fn prepared_action(&self) -> &PreparedAction {
        &self.prepared
    }

    /// Returns activation and optional typed value from the selected evaluation.
    #[must_use]
    pub const fn indicator(&self) -> &ActionStateIndicator {
        self.prepared.indicator()
    }

    /// Returns domains actually changed by the selected preflight commit.
    #[must_use]
    pub const fn actual_writes(&self) -> ActionStateDomains {
        self.prepared.actual_writes()
    }

    /// Returns the exact state against which routing ran.
    #[must_use]
    pub const fn base_state(&self) -> &EditorState {
        self.prepared.base_state()
    }

    /// Returns the exact snapshot against which routing ran.
    #[must_use]
    pub const fn base_snapshot(&self) -> &SnapshotId {
        self.prepared.base_snapshot()
    }

    /// Returns earlier disabled candidates in priority evaluation order.
    #[must_use]
    pub const fn fallthroughs(&self) -> &[IntentFallThrough] {
        &self.fallthroughs
    }

    /// Consumes this routed value into the existing action preparation API.
    pub fn into_preparation(self) -> ActionPreparation {
        ActionPreparation::Enabled(self.prepared)
    }

    /// Consumes this routed value and returns its cached prepared action.
    pub fn into_prepared_action(self) -> PreparedAction {
        self.prepared
    }
}

impl fmt::Debug for RoutedAction {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("RoutedAction")
            .field("intent_id", &self.intent_id)
            .field("binding", &self.binding)
            .field("base_snapshot", &self.base_snapshot())
            .field("fallthroughs", &self.fallthroughs)
            .finish_non_exhaustive()
    }
}

/// Complete exact-state result of routing one declared semantic intent.
#[must_use = "an intent route must be inspected or executed"]
#[derive(Debug, Eq, PartialEq)]
pub enum IntentRouteOutcome {
    /// No binding handled the declared intent.
    Unhandled(UnhandledIntent),
    /// One expected-disabled binding deliberately stopped fallback.
    Blocked(BlockedIntent),
    /// One binding produced a cached successfully preflighted action.
    Prepared(RoutedAction),
}

impl IntentRouteOutcome {
    /// Returns the routed semantic intent for every outcome.
    #[must_use]
    pub const fn intent_id(&self) -> &IntentId {
        match self {
            Self::Unhandled(outcome) => outcome.intent_id(),
            Self::Blocked(outcome) => outcome.intent_id(),
            Self::Prepared(outcome) => outcome.intent_id(),
        }
    }

    /// Returns the exact state against which routing ran.
    #[must_use]
    pub const fn base_state(&self) -> &EditorState {
        match self {
            Self::Unhandled(outcome) => outcome.base_state(),
            Self::Blocked(outcome) => outcome.base_state(),
            Self::Prepared(outcome) => outcome.base_state(),
        }
    }

    /// Returns the exact snapshot against which routing ran.
    #[must_use]
    pub const fn base_snapshot(&self) -> &SnapshotId {
        self.base_state().snapshot()
    }

    /// Returns disabled fallthroughs in priority evaluation order.
    #[must_use]
    pub const fn fallthroughs(&self) -> &[IntentFallThrough] {
        match self {
            Self::Unhandled(outcome) => outcome.fallthroughs(),
            Self::Blocked(outcome) => outcome.fallthroughs(),
            Self::Prepared(outcome) => outcome.fallthroughs(),
        }
    }

    /// Returns activation and optional typed value when routing reached a binding.
    #[must_use]
    pub const fn indicator(&self) -> Option<&ActionStateIndicator> {
        match self {
            Self::Unhandled(_) => None,
            Self::Blocked(outcome) => Some(outcome.indicator()),
            Self::Prepared(outcome) => Some(outcome.indicator()),
        }
    }

    /// Returns actual written domains for a successfully prepared route.
    #[must_use]
    pub const fn actual_writes(&self) -> Option<ActionStateDomains> {
        match self {
            Self::Prepared(outcome) => Some(outcome.actual_writes()),
            Self::Unhandled(_) | Self::Blocked(_) => None,
        }
    }

    /// Consumes this evaluated route into an exact execution receipt.
    ///
    /// The complete exact source state is checked before every receipt is returned, so
    /// stale unhandled or blocked results never masquerade as current capability
    /// state. Prepared execution consumes the cached commit without rerunning the
    /// action handler or transaction reducer.
    ///
    /// # Errors
    ///
    /// Returns [`IntentRouteBaseError`] only when the supplied current state has
    /// a different snapshot or reuses the routed snapshot for unequal content.
    pub fn execute(
        self,
        current: &EditorState,
    ) -> Result<IntentExecutionOutcome, IntentRouteBaseError> {
        match self {
            Self::Unhandled(outcome) => {
                let UnhandledIntent { intent_id, base, fallthroughs } = outcome;
                validate_route_base(&intent_id, None, &base, current)?;
                Ok(IntentExecutionOutcome::Unhandled {
                    intent: intent_id,
                    base_snapshot: base.snapshot().clone(),
                    fallthroughs,
                })
            }
            Self::Blocked(outcome) => {
                let BlockedIntent { intent_id, binding, preparation, fallthroughs } = outcome;
                let (base, reason, indicator) = preparation.into_parts();
                validate_route_base(&intent_id, Some(&binding), &base, current)?;
                Ok(IntentExecutionOutcome::Blocked {
                    intent: intent_id,
                    base_snapshot: base.snapshot().clone(),
                    binding,
                    reason,
                    indicator,
                    fallthroughs,
                })
            }
            Self::Prepared(outcome) => {
                let RoutedAction { intent_id, binding, prepared, fallthroughs } = outcome;
                let commit = prepared
                    .execute(current)
                    .map_err(|source| route_base_error(&intent_id, Some(&binding), source))?;
                Ok(IntentExecutionOutcome::Committed {
                    intent: intent_id,
                    binding,
                    commit: Box::new(commit),
                    fallthroughs,
                })
            }
        }
    }
}

fn validate_route_base(
    intent: &IntentId,
    binding: Option<&IntentBinding>,
    expected: &EditorState,
    current: &EditorState,
) -> Result<(), IntentRouteBaseError> {
    validate_prepared_base(expected, current)
        .map_err(|source| route_base_error(intent, binding, source))
}

fn route_base_error(
    intent: &IntentId,
    binding: Option<&IntentBinding>,
    source: PreparedActionExecutionError,
) -> IntentRouteBaseError {
    match source {
        PreparedActionExecutionError::StaleSnapshot { expected, actual } => {
            IntentRouteBaseError::StaleSnapshot {
                intent: intent.clone(),
                binding: binding.cloned().map(Box::new),
                expected,
                actual,
            }
        }
        PreparedActionExecutionError::BaseStateMismatch { snapshot } => {
            IntentRouteBaseError::BaseStateMismatch {
                intent: intent.clone(),
                binding: binding.cloned().map(Box::new),
                snapshot,
            }
        }
    }
}

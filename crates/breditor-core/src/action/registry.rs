use std::{collections::BTreeMap, fmt, sync::Arc};

use crate::{
    state::EditorState,
    transaction::{Transaction, TransactionMetadata, TransactionOutcome},
};

use super::{
    capability::{ActionDecision, ActionPreparation, DisabledActionPreparation, PreparedAction},
    error::{ActionPrepareError, ActionRegistryError, InvalidActionPlan},
    handler::{ActionDescriptor, ActionRegistration, ErasedAction, ErasedActionError},
    id::ActionId,
    input::ActionInvocation,
    state::{ActionStateDomains, validate_indicator},
};

struct RegistryEntry {
    descriptor: ActionDescriptor,
    handler: Arc<dyn ErasedAction>,
}

/// Immutable deterministic registry of pure action handlers.
///
/// Entries are enumerated in lexical [`ActionId`] order. Construction first
/// rejects duplicate identities and then unsupported history-read declarations.
/// Each phase selects the lexical first invalid action, so caller registration
/// order never chooses the diagnostic.
#[derive(Clone, Default)]
pub struct ActionRegistry {
    entries: Arc<BTreeMap<ActionId, RegistryEntry>>,
}

impl ActionRegistry {
    /// Builds and freezes a registry from typed registrations.
    ///
    /// # Errors
    ///
    /// Returns [`ActionRegistryError::DuplicateActionId`] when two registrations
    /// claim the same identity, or [`ActionRegistryError::UnsupportedHistoryRead`]
    /// when an ordinary action claims to read session history even though
    /// [`crate::action::Action::evaluate`] receives only an editor state. No
    /// partial registry is returned.
    pub fn try_new(
        mut registrations: Vec<ActionRegistration>,
    ) -> Result<Self, ActionRegistryError> {
        registrations.sort_by(|left, right| left.descriptor().id().cmp(right.descriptor().id()));
        for pair in registrations.windows(2) {
            if pair[0].descriptor().id() == pair[1].descriptor().id() {
                return Err(ActionRegistryError::DuplicateActionId {
                    id: pair[0].descriptor().id().clone(),
                });
            }
        }
        if let Some(registration) = registrations.iter().find(|registration| {
            registration
                .descriptor()
                .state_spec()
                .effects()
                .reads()
                .contains(ActionStateDomains::HISTORY)
        }) {
            return Err(ActionRegistryError::UnsupportedHistoryRead {
                id: registration.descriptor().id().clone(),
            });
        }
        let entries = registrations
            .into_iter()
            .map(|registration| {
                let ActionRegistration { descriptor, handler } = registration;
                (descriptor.id().clone(), RegistryEntry { descriptor, handler })
            })
            .collect::<BTreeMap<_, _>>();
        Ok(Self { entries: Arc::new(entries) })
    }

    /// Returns the number of registered actions.
    #[must_use]
    pub fn len(&self) -> usize {
        self.entries.len()
    }

    /// Returns whether no actions are registered.
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }

    /// Looks up one action descriptor.
    #[must_use]
    pub fn descriptor(&self, id: &ActionId) -> Option<&ActionDescriptor> {
        self.entries.get(id).map(|entry| &entry.descriptor)
    }

    /// Iterates descriptors in canonical lexical action-ID order.
    #[must_use]
    pub fn descriptors(&self) -> impl ExactSizeIterator<Item = &ActionDescriptor> {
        self.entries.values().map(|entry| &entry.descriptor)
    }

    /// Runs the sole capability/state query path and preflights enabled plans.
    ///
    /// Disabled handlers preserve their exact reason. Enabled plans are bound to
    /// `state`, stamped with the invoked action name, and applied once. The exact
    /// transaction and successful commit are cached in the returned preparation.
    ///
    /// # Errors
    ///
    /// Returns [`ActionPrepareError`] for an unknown action, malformed typed
    /// input, invalid observable indicator, deterministic handler fault, failed
    /// transaction, undeclared write effect, or enabled no-op.
    pub fn prepare(
        &self,
        state: &EditorState,
        invocation: &ActionInvocation,
    ) -> Result<ActionPreparation, ActionPrepareError> {
        let id = invocation.id();
        let entry = self
            .entries
            .get(id)
            .ok_or_else(|| ActionPrepareError::UnknownAction { id: id.clone() })?;
        let evaluation =
            entry.handler.evaluate(state, invocation.input()).map_err(|error| match error {
                ErasedActionError::Input(source) => {
                    ActionPrepareError::InvalidInput { id: id.clone(), source }
                }
                ErasedActionError::Fault(source) => {
                    ActionPrepareError::Fault { id: id.clone(), source }
                }
            })?;
        let (decision, indicator) = evaluation.into_parts();
        validate_indicator(entry.descriptor.state_spec().contract(), &indicator)
            .map_err(|source| ActionPrepareError::InvalidState { id: id.clone(), source })?;
        let plan = match decision {
            ActionDecision::Disabled(reason) => {
                return Ok(ActionPreparation::Disabled(DisabledActionPreparation::new(
                    id.clone(),
                    state.clone(),
                    reason,
                    indicator,
                )));
            }
            ActionDecision::Enabled(plan) => plan,
        };

        let (operations, relocation, selection, pending_formats, history) = plan.into_parts();
        let metadata = TransactionMetadata::new(Some(id.qualified_name().clone()), history);
        let transaction = Transaction::new(state, operations)
            .with_selection_relocation(relocation)
            .with_selection_update(selection)
            .with_pending_formats_update(pending_formats)
            .with_metadata(metadata);
        let outcome = transaction.apply(state.context(), state).map_err(|source| {
            ActionPrepareError::InvalidPlan {
                id: id.clone(),
                source: InvalidActionPlan::Transaction { source: Box::new(source) },
            }
        })?;
        match outcome {
            TransactionOutcome::Committed(commit) => {
                let actual_writes = actual_writes(&commit);
                let declared = entry.descriptor.state_spec().effects().may_write();
                if !declared.contains(actual_writes) {
                    return Err(ActionPrepareError::InvalidPlan {
                        id: id.clone(),
                        source: InvalidActionPlan::UndeclaredWrites {
                            declared,
                            actual: actual_writes,
                        },
                    });
                }
                Ok(ActionPreparation::Enabled(PreparedAction::new(
                    id.clone(),
                    transaction,
                    commit,
                    indicator,
                    actual_writes,
                )))
            }
            TransactionOutcome::Unchanged => Err(ActionPrepareError::InvalidPlan {
                id: id.clone(),
                source: InvalidActionPlan::Unchanged,
            }),
        }
    }
}

fn actual_writes(commit: &crate::transaction::Commit) -> ActionStateDomains {
    let mut domains = ActionStateDomains::HISTORY | ActionStateDomains::SNAPSHOT;
    if !commit.forward_operations().is_empty() {
        domains |= ActionStateDomains::DOCUMENT;
    }
    if commit.before().selection() != commit.after().selection() {
        domains |= ActionStateDomains::SELECTION;
    }
    if commit.before().pending_formats() != commit.after().pending_formats() {
        domains |= ActionStateDomains::PENDING_FORMATS;
    }
    domains
}

impl fmt::Debug for ActionRegistry {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("ActionRegistry")
            .field("descriptors", &self.descriptors().collect::<Vec<_>>())
            .finish()
    }
}

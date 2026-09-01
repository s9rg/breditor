use std::{fmt, sync::Arc};

use crate::{
    action::{
        ActionInput, ActionPreparation, ActionRegistry, ActionStateDomains, ActionStateIndicator,
        DisabledReason,
        input::validate_input_contract,
        routing::{IntentRouteOutcome, IntentRouter},
    },
    identity::QualifiedName,
    session::EditorSession,
    transaction::{Commit, ReplayDirection},
};

use super::{
    ActionStateBatch, ActionStateCatalogError, ActionStateDeriveError, ActionStateDescriptor,
    ActionStateEntry, ActionStateFault, ActionStateOutcome, ActionStateProvenance,
    ActionStateRegistration, ActionStateSource, ObservedAvailability, ResolvedActionState,
    UnhandledActionState,
    batch::{ActionStateBatchBuilder, DynamicSummary, measure_input, usize_to_u32},
    limits::{
        MAX_ACTION_STATE_ENTRIES, MAX_ACTION_STATE_INPUT_TEXT_BYTES,
        MAX_ACTION_STATE_INPUT_VALUE_COUNT,
    },
};

struct CatalogInner {
    actions: ActionRegistry,
    router: Option<IntentRouter>,
    descriptors: Box<[ActionStateDescriptor]>,
}

/// Immutable canonical catalog of observable action, intent, and history state.
///
/// A catalog owns no UI metadata, mutable callbacks, cached batch, subscription,
/// plugin lifecycle, or permission boundary. Duplicate sources are valid so
/// distinct controls can deliberately observe one invocation; duplicate
/// [`super::ActionStateId`] values are rejected. Native handlers remain trusted
/// and can still block, panic, or violate process isolation outside this API.
/// Derived entries are normalized before the next source runs, bounding retained
/// output; one currently evaluated route can transiently hold its raw trace until
/// the per-entry limit replaces it.
#[derive(Clone)]
pub struct ActionStateCatalog {
    inner: Arc<CatalogInner>,
}

impl ActionStateCatalog {
    /// Builds a direct/history-only catalog over one frozen action registry.
    ///
    /// Registrations become canonical in lexical observable-ID order. Routed
    /// registrations reject this constructor even if their intent happens to
    /// share a name with an action.
    ///
    /// # Errors
    ///
    /// Returns [`ActionStateCatalogError`] for fixed resource overflow,
    /// duplicate identities, routed sources, unknown targets, or an invocation
    /// envelope that differs from its frozen descriptor. Fixed-input resource
    /// errors report the complete catalog aggregate before target validation.
    pub fn try_new(
        actions: ActionRegistry,
        registrations: Vec<ActionStateRegistration>,
    ) -> Result<Self, ActionStateCatalogError> {
        Self::build(actions, None, registrations)
    }

    /// Builds a catalog over one frozen semantic router and its action registry.
    ///
    /// Direct sources are always resolved against `router.action_registry()`,
    /// so a catalog cannot accidentally evaluate direct and routed entries over
    /// different registry generations.
    ///
    /// # Errors
    ///
    /// Returns [`ActionStateCatalogError`] for fixed resource overflow,
    /// duplicate identities, unknown targets, or an invocation envelope that
    /// differs from its frozen descriptor. Fixed-input resource errors report
    /// the complete catalog aggregate before target validation.
    pub fn try_new_with_router(
        router: IntentRouter,
        registrations: Vec<ActionStateRegistration>,
    ) -> Result<Self, ActionStateCatalogError> {
        let actions = router.action_registry().clone();
        Self::build(actions, Some(router), registrations)
    }

    fn build(
        actions: ActionRegistry,
        router: Option<IntentRouter>,
        mut registrations: Vec<ActionStateRegistration>,
    ) -> Result<Self, ActionStateCatalogError> {
        let entry_count = usize_to_u32(registrations.len());
        if entry_count > MAX_ACTION_STATE_ENTRIES {
            return Err(ActionStateCatalogError::too_many_entries(entry_count));
        }

        registrations.sort_by(|left, right| left.id().cmp(right.id()));
        if let Some(pair) = registrations.windows(2).find(|pair| pair[0].id() == pair[1].id()) {
            return Err(ActionStateCatalogError::DuplicateId { id: pair[0].id().clone() });
        }

        let fixed_inputs = registrations
            .iter()
            .filter_map(|registration| source_input(registration.source()))
            .map(measure_input)
            .fold(DynamicSummary::default(), DynamicSummary::saturating_add);
        if fixed_inputs.value_count() > MAX_ACTION_STATE_INPUT_VALUE_COUNT {
            return Err(ActionStateCatalogError::input_value_count(fixed_inputs.value_count()));
        }
        if fixed_inputs.text_bytes() > MAX_ACTION_STATE_INPUT_TEXT_BYTES {
            return Err(ActionStateCatalogError::input_text_bytes(fixed_inputs.text_bytes()));
        }

        let mut descriptors = Vec::with_capacity(registrations.len());
        for registration in registrations {
            let (id, source) = registration.into_parts();
            let descriptor = match &source {
                ActionStateSource::Direct(invocation) => {
                    let action = actions.descriptor(invocation.id()).ok_or_else(|| {
                        ActionStateCatalogError::UnknownAction {
                            id: id.clone(),
                            action: invocation.id().clone(),
                        }
                    })?;
                    validate_input_contract(action.input_contract(), invocation.input()).map_err(
                        |source| ActionStateCatalogError::InvalidActionInput {
                            id: id.clone(),
                            action: invocation.id().clone(),
                            source,
                        },
                    )?;
                    ActionStateDescriptor::new(
                        id,
                        source,
                        action.state_spec().contract().clone(),
                        action.state_spec().effects(),
                    )
                }
                ActionStateSource::Routed(invocation) => {
                    let router =
                        router.as_ref().ok_or_else(|| ActionStateCatalogError::RouterRequired {
                            id: id.clone(),
                            intent: invocation.id().clone(),
                        })?;
                    let intent = router.declaration(invocation.id()).ok_or_else(|| {
                        ActionStateCatalogError::UnknownIntent {
                            id: id.clone(),
                            intent: invocation.id().clone(),
                        }
                    })?;
                    validate_input_contract(intent.input_contract(), invocation.input()).map_err(
                        |source| ActionStateCatalogError::InvalidIntentInput {
                            id: id.clone(),
                            intent: invocation.id().clone(),
                            source,
                        },
                    )?;
                    ActionStateDescriptor::new(
                        id,
                        source,
                        intent.state_spec().contract().clone(),
                        intent.state_spec().effects(),
                    )
                }
                ActionStateSource::History(_) => ActionStateDescriptor::history(id, source),
            };
            descriptors.push(descriptor);
        }

        Ok(Self {
            inner: Arc::new(CatalogInner {
                actions,
                router,
                descriptors: descriptors.into_boxed_slice(),
            }),
        })
    }

    /// Returns the number of observable entries.
    #[must_use]
    pub fn len(&self) -> usize {
        self.inner.descriptors.len()
    }

    /// Returns whether this catalog contains no observable entries.
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.inner.descriptors.is_empty()
    }

    /// Returns the exact frozen registry used by direct sources and routing.
    ///
    /// Hosts should reprepare clicks through this authority so a display batch
    /// cannot be paired accidentally with another registry generation.
    #[must_use]
    pub fn action_registry(&self) -> &ActionRegistry {
        &self.inner.actions
    }

    /// Returns the exact frozen router used by routed sources, when configured.
    ///
    /// A batch is display-only; hosts should route a later click through this
    /// value against the then-current session rather than cache its observation.
    #[must_use]
    pub fn intent_router(&self) -> Option<&IntentRouter> {
        self.inner.router.as_ref()
    }

    /// Returns descriptors in canonical lexical observable-ID order.
    #[must_use]
    pub fn descriptors(&self) -> &[ActionStateDescriptor] {
        &self.inner.descriptors
    }

    /// Looks up one frozen descriptor by observable identity.
    #[must_use]
    pub fn descriptor(&self, id: &super::ActionStateId) -> Option<&ActionStateDescriptor> {
        self.inner
            .descriptors
            .binary_search_by(|descriptor| descriptor.id().cmp(id))
            .ok()
            .map(|index| &self.inner.descriptors[index])
    }

    /// Derives one immutable batch from the exact current session instant.
    ///
    /// Every descriptor invokes exactly one authoritative preparation, route,
    /// or replay preflight. Entry-local failures are retained as faults and do
    /// not suppress siblings. Successful preparations are inspected and then
    /// dropped; the batch cannot later publish a stale cached transition. Output
    /// normalization happens before the next source is evaluated, so only the
    /// currently running source may transiently exceed an entry payload bound.
    ///
    /// # Errors
    ///
    /// Returns [`ActionStateDeriveError`] only when the retained complete batch
    /// exceeds a catalog-wide dynamic payload bound. No partial batch is
    /// returned.
    pub fn derive(
        &self,
        session: &EditorSession,
    ) -> Result<ActionStateBatch, ActionStateDeriveError> {
        let base = session.state().clone();
        let history = session.history_status();
        let mut batch = ActionStateBatchBuilder::new(base, history, self.inner.descriptors.len());
        for descriptor in self.inner.descriptors.iter().cloned() {
            let outcome = self.derive_entry(session, &descriptor);
            batch.push(ActionStateEntry::new(descriptor, outcome))?;
        }
        Ok(batch.finish())
    }

    pub(super) fn derive_entry(
        &self,
        session: &EditorSession,
        descriptor: &ActionStateDescriptor,
    ) -> ActionStateOutcome {
        match descriptor.source() {
            ActionStateSource::Direct(invocation) => {
                match self.inner.actions.prepare(session.state(), invocation) {
                    Ok(ActionPreparation::Disabled(disabled)) => {
                        ActionStateOutcome::Resolved(ResolvedActionState::new(
                            ObservedAvailability::Disabled(disabled.reason().clone()),
                            disabled.indicator().clone(),
                            None,
                            ActionStateProvenance::Direct { action: invocation.id().clone() },
                        ))
                    }
                    Ok(ActionPreparation::Enabled(prepared)) => {
                        ActionStateOutcome::Resolved(ResolvedActionState::new(
                            ObservedAvailability::Enabled,
                            prepared.indicator().clone(),
                            Some(prepared.actual_writes()),
                            ActionStateProvenance::Direct { action: invocation.id().clone() },
                        ))
                    }
                    Err(source) => ActionStateOutcome::Fault(ActionStateFault::direct(source)),
                }
            }
            ActionStateSource::Routed(invocation) => {
                let Some(router) = self.inner.router.as_ref() else {
                    return ActionStateOutcome::Fault(ActionStateFault::Invariant {
                        code: QualifiedName::from_known_static(
                            "breditor/missing-action-state-router",
                        ),
                    });
                };
                match router.route(session.state(), invocation) {
                    Ok(IntentRouteOutcome::Unhandled(unhandled)) => {
                        ActionStateOutcome::Unhandled(UnhandledActionState::new(
                            unhandled.intent_id().clone(),
                            unhandled.fallthroughs().to_vec().into_boxed_slice(),
                        ))
                    }
                    Ok(IntentRouteOutcome::Blocked(blocked)) => {
                        ActionStateOutcome::Resolved(ResolvedActionState::new(
                            ObservedAvailability::Blocked(blocked.reason().clone()),
                            blocked.indicator().clone(),
                            None,
                            ActionStateProvenance::Routed {
                                intent: blocked.intent_id().clone(),
                                binding: blocked.binding().clone(),
                                fallthroughs: blocked.fallthroughs().to_vec().into_boxed_slice(),
                            },
                        ))
                    }
                    Ok(IntentRouteOutcome::Prepared(selected)) => {
                        ActionStateOutcome::Resolved(ResolvedActionState::new(
                            ObservedAvailability::Enabled,
                            selected.indicator().clone(),
                            Some(selected.actual_writes()),
                            ActionStateProvenance::Routed {
                                intent: selected.intent_id().clone(),
                                binding: selected.binding().clone(),
                                fallthroughs: selected.fallthroughs().to_vec().into_boxed_slice(),
                            },
                        ))
                    }
                    Err(source) => ActionStateOutcome::Fault(ActionStateFault::routed(source)),
                }
            }
            ActionStateSource::History(direction) => Self::derive_history(session, *direction),
        }
    }

    fn derive_history(session: &EditorSession, direction: ReplayDirection) -> ActionStateOutcome {
        match session.preflight_replay(direction) {
            Ok(Some(prepared)) => ActionStateOutcome::Resolved(ResolvedActionState::new(
                ObservedAvailability::Enabled,
                ActionStateIndicator::stateless(),
                Some(history_actual_writes(prepared.commit())),
                ActionStateProvenance::History { direction: prepared.direction() },
            )),
            Ok(None) => ActionStateOutcome::Resolved(ResolvedActionState::new(
                ObservedAvailability::Disabled(history_unavailable_reason(direction)),
                ActionStateIndicator::stateless(),
                None,
                ActionStateProvenance::History { direction },
            )),
            Err(source) => ActionStateOutcome::Fault(ActionStateFault::history(direction, source)),
        }
    }
}

impl fmt::Debug for ActionStateCatalog {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        let ids = self.inner.descriptors.iter().map(ActionStateDescriptor::id).collect::<Vec<_>>();
        formatter
            .debug_struct("ActionStateCatalog")
            .field("has_router", &self.inner.router.is_some())
            .field("entry_ids", &ids)
            .finish_non_exhaustive()
    }
}

fn source_input(source: &ActionStateSource) -> Option<&ActionInput> {
    match source {
        ActionStateSource::Direct(invocation) => Some(invocation.input()),
        ActionStateSource::Routed(invocation) => Some(invocation.input()),
        ActionStateSource::History(_) => None,
    }
}

fn history_unavailable_reason(direction: ReplayDirection) -> DisabledReason {
    let code = match direction {
        ReplayDirection::Undo => QualifiedName::from_known_static("breditor/nothing-to-undo"),
        ReplayDirection::Redo => QualifiedName::from_known_static("breditor/nothing-to-redo"),
    };
    DisabledReason::new(code, None)
}

fn history_actual_writes(commit: &Commit) -> ActionStateDomains {
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

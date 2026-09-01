//! Black-box contracts for immutable action-state catalogs and exact-base batches.

mod support;

use std::{
    error::Error,
    sync::{
        Arc,
        atomic::{AtomicUsize, Ordering},
    },
};

use breditor_core::{
    action::{
        Action, ActionActivation, ActionActivationContract, ActionDecision, ActionEffects,
        ActionEvaluation, ActionFault, ActionId, ActionInput, ActionInputContract,
        ActionInputError, ActionInputVersion, ActionInvocation, ActionPlan, ActionRegistration,
        ActionRegistry, ActionStateActionFault, ActionStateBatch, ActionStateCatalog,
        ActionStateCatalogError, ActionStateContract, ActionStateDescriptor, ActionStateDomains,
        ActionStateFault, ActionStateId, ActionStateIndicator, ActionStateOperationFault,
        ActionStateOutcome, ActionStatePlanFault, ActionStateProvenance, ActionStateRegistration,
        ActionStateSource, ActionStateSpec, ActionStateTransactionFault, ActionStateValue,
        ActionStateValueContract, ActionStateValueVersion, ActionValue, DecodeActionInput,
        DisabledReason, MAX_ACTION_STATE_ENTRIES, MAX_ACTION_STATE_INPUT_TEXT_BYTES,
        MAX_ACTION_VALUE_TEXT_BYTES, ObservedAvailability, ResolvedActionState, TypedActionInput,
        routing::{
            BindingId, BindingPriority, DisabledRouting, IntentBinding, IntentDeclaration,
            IntentId, IntentInvocation, IntentRouter,
        },
    },
    codec::DocumentJsonCodec,
    document::{FormatSet, TextFragment, TextRun},
    identity::QualifiedName,
    operation::{
        Operation, RootTextBoundary, RootTextRange, RootTextReplace, SelectionRelocationPolicy,
        TextRange, TextSplice,
    },
    position::{NodePath, TextOffset},
    session::EditorSession,
    state::{EditorContext, EditorState, LineageId},
    transaction::{
        HistoryIntent, PendingFormatsUpdate, ReplayDirection, SelectionUpdate, Transaction,
        TransactionMetadata,
    },
};
use support::{TestResult, document_json, paragraph, test_error, text_node};

fn action_id(value: &str) -> Result<ActionId, Box<dyn Error>> {
    ActionId::try_new(value).map_err(Into::into)
}

fn binding_id(value: &str) -> Result<BindingId, Box<dyn Error>> {
    BindingId::try_new(value).map_err(Into::into)
}

fn intent_id(value: &str) -> Result<IntentId, Box<dyn Error>> {
    IntentId::try_new(value).map_err(Into::into)
}

fn state_id(value: &str) -> Result<ActionStateId, Box<dyn Error>> {
    ActionStateId::try_new(value).map_err(Into::into)
}

fn name(value: &str) -> Result<QualifiedName, Box<dyn Error>> {
    QualifiedName::try_new(value).map_err(Into::into)
}

fn input_contract(value: &str) -> Result<ActionInputContract, Box<dyn Error>> {
    Ok(ActionInputContract::new(name(value)?, ActionInputVersion::one()))
}

fn value_contract(value: &str) -> Result<ActionStateValueContract, Box<dyn Error>> {
    Ok(ActionStateValueContract::new(name(value)?, ActionStateValueVersion::one()))
}

fn editor_state(lineage: &str, text: &str) -> Result<EditorState, Box<dyn Error>> {
    let context = EditorContext::default();
    let children = if text.is_empty() { Vec::new() } else { vec![text_node(text, false)] };
    let document = DocumentJsonCodec::new(context.schema().clone())
        .with_limits(context.limits().clone())
        .decode(&document_json(&[paragraph(&children)]))?;
    EditorState::try_new(&context, LineageId::try_new(lineage)?, document, None, None)
        .map_err(Into::into)
}

fn insertion_operation(state: &EditorState, text: &str) -> Result<Operation, Box<dyn Error>> {
    let start = TextOffset::try_new(0)?;
    let range = TextRange::try_new(NodePath::try_from_indices(vec![0])?, start, start)?;
    let run = TextRun::try_new(text, FormatSet::default())?;
    TextSplice::capture(state.context(), state.document(), range, TextFragment::from(run))
        .map(Operation::from)
        .map_err(Into::into)
}

fn insertion_plan(state: &EditorState, text: &str) -> Result<ActionPlan, Box<dyn Error>> {
    Ok(ActionPlan::new(
        vec![insertion_operation(state, text)?],
        SelectionRelocationPolicy::default(),
        SelectionUpdate::Relocate,
        PendingFormatsUpdate::Preserve,
        HistoryIntent::Record,
    ))
}

fn publish_insertion(session: &mut EditorSession, text: &str) -> TestResult {
    let transaction =
        Transaction::new(session.state(), vec![insertion_operation(session.state(), text)?])
            .with_metadata(TransactionMetadata::new(None, HistoryIntent::Record));
    if session.apply_transaction(&transaction)?.into_commit().is_none() {
        return Err(test_error("insertion transaction was unexpectedly unchanged").into());
    }
    Ok(())
}

fn direct_registration(id: ActionStateId, action: ActionId) -> ActionStateRegistration {
    ActionStateRegistration::new(
        id,
        ActionStateSource::direct(ActionInvocation::without_input(action)),
    )
}

fn routed_registration(id: ActionStateId, intent: IntentId) -> ActionStateRegistration {
    ActionStateRegistration::new(
        id,
        ActionStateSource::routed(IntentInvocation::without_input(intent)),
    )
}

fn history_registration(id: ActionStateId, direction: ReplayDirection) -> ActionStateRegistration {
    ActionStateRegistration::new(id, ActionStateSource::history(direction))
}

fn resolved<'a>(
    batch: &'a ActionStateBatch,
    id: &ActionStateId,
) -> Result<&'a ResolvedActionState, Box<dyn Error>> {
    let entry = batch.entry(id).ok_or_else(|| test_error(format!("missing entry {id}")))?;
    match entry.outcome() {
        ActionStateOutcome::Resolved(outcome) => Ok(outcome),
        other => Err(test_error(format!("entry {id} was not resolved: {other:?}")).into()),
    }
}

fn unavailable_code<'a>(
    batch: &'a ActionStateBatch,
    id: &ActionStateId,
) -> Result<Option<&'a QualifiedName>, Box<dyn Error>> {
    Ok(resolved(batch, id)?.availability().reason().map(DisabledReason::code))
}

#[derive(Clone)]
enum ProbeBehavior {
    Insert(&'static str),
    Disabled(DisabledReason),
    Fault(ActionFault),
}

#[derive(Clone)]
struct ProbeAction {
    evaluations: Arc<AtomicUsize>,
    behavior: ProbeBehavior,
    indicator: ActionStateIndicator,
    insertion_fault: ActionFault,
}

impl Action for ProbeAction {
    type Input = ();

    fn evaluate(
        &self,
        state: &EditorState,
        (): &Self::Input,
    ) -> Result<ActionEvaluation, ActionFault> {
        self.evaluations.fetch_add(1, Ordering::SeqCst);
        let decision = match &self.behavior {
            ProbeBehavior::Insert(text) => ActionDecision::Enabled(
                insertion_plan(state, text).map_err(|_| self.insertion_fault.clone())?,
            ),
            ProbeBehavior::Disabled(reason) => ActionDecision::Disabled(reason.clone()),
            ProbeBehavior::Fault(fault) => return Err(fault.clone()),
        };
        Ok(ActionEvaluation::new(decision, self.indicator.clone()))
    }
}

fn probe_registration(
    id: ActionId,
    evaluations: Arc<AtomicUsize>,
    behavior: ProbeBehavior,
    indicator: ActionStateIndicator,
    state_spec: ActionStateSpec,
) -> ActionRegistration {
    let insertion_fault = ActionFault::new(id.qualified_name().clone(), None);
    ActionRegistration::without_input(
        id,
        ProbeAction { evaluations, behavior, indicator, insertion_fault },
    )
    .with_state_spec(state_spec)
}

#[derive(Clone, Copy)]
struct OpaqueInput;

impl DecodeActionInput for OpaqueInput {
    fn decode(
        registered_contract: Option<&ActionInputContract>,
        input: &ActionInput,
    ) -> Result<Self, ActionInputError> {
        let Some(expected) = registered_contract else {
            return Err(ActionInputError::MissingRegisteredContract);
        };
        let _ = input.require_typed(expected)?;
        Ok(Self)
    }
}

impl TypedActionInput for OpaqueInput {}

#[derive(Clone)]
struct FixedPlanAction {
    plan: ActionPlan,
}

impl Action for FixedPlanAction {
    type Input = ();

    fn evaluate(&self, _: &EditorState, (): &Self::Input) -> Result<ActionEvaluation, ActionFault> {
        Ok(ActionEvaluation::stateless(ActionDecision::Enabled(self.plan.clone())))
    }
}

#[derive(Clone)]
struct TypedDisabledAction {
    reason: DisabledReason,
}

impl Action for TypedDisabledAction {
    type Input = OpaqueInput;

    fn evaluate(&self, _: &EditorState, _: &Self::Input) -> Result<ActionEvaluation, ActionFault> {
        Ok(ActionEvaluation::stateless(ActionDecision::Disabled(self.reason.clone())))
    }
}

fn binding(
    id: &str,
    intent: &IntentId,
    action: &ActionId,
    priority: i32,
    disabled_routing: DisabledRouting,
) -> Result<IntentBinding, Box<dyn Error>> {
    Ok(IntentBinding::new(
        binding_id(id)?,
        intent.clone(),
        action.clone(),
        BindingPriority::new(priority),
        disabled_routing,
    ))
}

#[test]
fn catalog_ids_are_lexical_duplicate_ids_fail_and_duplicate_sources_are_valid() -> TestResult {
    let action = action_id("test/shared-source")?;
    let evaluations = Arc::new(AtomicUsize::new(0));
    let registry = ActionRegistry::try_new(vec![probe_registration(
        action.clone(),
        evaluations.clone(),
        ProbeBehavior::Insert("x"),
        ActionStateIndicator::stateless(),
        ActionStateSpec::stateless(),
    )])?;
    let first = state_id("test/a-control")?;
    let last = state_id("test/z-control")?;
    let source = ActionStateSource::direct(ActionInvocation::without_input(action));
    let catalog = ActionStateCatalog::try_new(
        registry.clone(),
        vec![
            ActionStateRegistration::new(last.clone(), source.clone()),
            ActionStateRegistration::new(first.clone(), source.clone()),
        ],
    )?;
    assert_eq!(catalog.len(), 2);
    assert!(!catalog.is_empty());
    assert_eq!(
        catalog.descriptors().iter().map(ActionStateDescriptor::id).collect::<Vec<_>>(),
        vec![&first, &last]
    );
    assert_eq!(catalog.descriptor(&first).map(ActionStateDescriptor::source), Some(&source));

    let session = EditorSession::new(editor_state("catalog-duplicate-source", "a")?);
    let batch = catalog.derive(&session)?;
    assert_eq!(evaluations.load(Ordering::SeqCst), 2);
    assert!(resolved(&batch, &first)?.availability().is_enabled());
    assert!(resolved(&batch, &last)?.availability().is_enabled());
    assert_eq!(batch.summary().resolved_count(), 2);

    let duplicate = state_id("test/duplicate-control")?;
    assert_eq!(
        ActionStateCatalog::try_new(
            registry,
            vec![
                ActionStateRegistration::new(duplicate.clone(), source.clone()),
                ActionStateRegistration::new(duplicate.clone(), source),
            ],
        )
        .err(),
        Some(ActionStateCatalogError::DuplicateId { id: duplicate })
    );
    Ok(())
}

#[test]
#[allow(clippy::too_many_lines)]
fn construction_rejects_unknown_sources_router_absence_and_input_envelopes() -> TestResult {
    let no_input = action_id("test/no-input")?;
    let typed = action_id("test/typed-input")?;
    let expected = input_contract("test/opaque-input")?;
    let actual = input_contract("test/other-input")?;
    let reason = DisabledReason::new(name("test/typed-disabled")?, None);
    let registry = ActionRegistry::try_new(vec![
        probe_registration(
            no_input.clone(),
            Arc::new(AtomicUsize::new(0)),
            ProbeBehavior::Disabled(reason.clone()),
            ActionStateIndicator::stateless(),
            ActionStateSpec::stateless(),
        ),
        ActionRegistration::with_input(
            typed.clone(),
            expected.clone(),
            TypedDisabledAction { reason },
        ),
    ])?;

    let missing_control = state_id("test/missing-action-control")?;
    let missing_action = action_id("test/missing-action")?;
    assert_eq!(
        ActionStateCatalog::try_new(
            registry.clone(),
            vec![direct_registration(missing_control.clone(), missing_action.clone())],
        )
        .err(),
        Some(ActionStateCatalogError::UnknownAction {
            id: missing_control,
            action: missing_action,
        })
    );

    let unexpected_control = state_id("test/unexpected-input-control")?;
    assert_eq!(
        ActionStateCatalog::try_new(
            registry.clone(),
            vec![ActionStateRegistration::new(
                unexpected_control.clone(),
                ActionStateSource::direct(ActionInvocation::new(
                    no_input,
                    ActionInput::typed(actual.clone(), ActionValue::boolean(true)),
                )),
            )],
        )
        .err(),
        Some(ActionStateCatalogError::InvalidActionInput {
            id: unexpected_control,
            action: action_id("test/no-input")?,
            source: ActionInputError::ExpectedNone { actual: actual.clone() },
        })
    );

    let missing_input_control = state_id("test/missing-input-control")?;
    assert_eq!(
        ActionStateCatalog::try_new(
            registry.clone(),
            vec![direct_registration(missing_input_control.clone(), typed.clone())],
        )
        .err(),
        Some(ActionStateCatalogError::InvalidActionInput {
            id: missing_input_control,
            action: typed.clone(),
            source: ActionInputError::ExpectedTyped { expected: expected.clone() },
        })
    );

    let declared_intent = intent_id("test/declared-intent")?;
    let routed_control = state_id("test/routed-control")?;
    assert_eq!(
        ActionStateCatalog::try_new(
            registry.clone(),
            vec![routed_registration(routed_control.clone(), declared_intent.clone())],
        )
        .err(),
        Some(ActionStateCatalogError::RouterRequired {
            id: routed_control,
            intent: declared_intent.clone(),
        })
    );

    let router = IntentRouter::try_new(
        registry.clone(),
        vec![IntentDeclaration::new(declared_intent)],
        Vec::new(),
    )?;
    let unknown_control = state_id("test/unknown-intent-control")?;
    let unknown_intent = intent_id("test/unknown-intent")?;
    assert_eq!(
        ActionStateCatalog::try_new_with_router(
            router,
            vec![routed_registration(unknown_control.clone(), unknown_intent.clone())],
        )
        .err(),
        Some(ActionStateCatalogError::UnknownIntent {
            id: unknown_control,
            intent: unknown_intent,
        })
    );

    let typed_intent = intent_id("test/typed-intent")?;
    let typed_router = IntentRouter::try_new(
        registry,
        vec![IntentDeclaration::with_input(typed_intent.clone(), expected.clone())],
        vec![binding(
            "test/typed-intent-binding",
            &typed_intent,
            &typed,
            0,
            DisabledRouting::Block,
        )?],
    )?;
    let invalid_intent_control = state_id("test/invalid-intent-input-control")?;
    assert_eq!(
        ActionStateCatalog::try_new_with_router(
            typed_router,
            vec![ActionStateRegistration::new(
                invalid_intent_control.clone(),
                ActionStateSource::routed(IntentInvocation::new(
                    typed_intent.clone(),
                    ActionInput::typed(actual.clone(), ActionValue::boolean(false)),
                )),
            )],
        )
        .err(),
        Some(ActionStateCatalogError::InvalidIntentInput {
            id: invalid_intent_control,
            intent: typed_intent,
            source: ActionInputError::ContractMismatch { expected, actual },
        })
    );
    Ok(())
}

#[test]
fn direct_batches_preserve_authoritative_availability_activation_and_typed_values() -> TestResult {
    let contract = value_contract("test/toolbar-value")?;
    let state_contract =
        ActionStateContract::new(ActionActivationContract::Tracked, Some(contract.clone()));
    let spec = ActionStateSpec::new(state_contract.clone(), ActionEffects::conservative());
    let indicator_secret = "secret-indicator-payload";
    let reason_secret = "secret-disabled-detail";
    let indicator = ActionStateIndicator::new(
        ActionActivation::Active,
        ActionStateValue::uniform(
            contract.clone(),
            ActionValue::try_from_string(indicator_secret)?,
        ),
    );
    let disabled_reason = DisabledReason::new(
        name("test/temporarily-disabled")?,
        Some(ActionValue::try_from_string(reason_secret)?),
    );
    let enabled_action = action_id("test/enabled-with-state")?;
    let disabled_action = action_id("test/disabled-but-active")?;
    let registry = ActionRegistry::try_new(vec![
        probe_registration(
            enabled_action.clone(),
            Arc::new(AtomicUsize::new(0)),
            ProbeBehavior::Insert("x"),
            indicator.clone(),
            spec.clone(),
        ),
        probe_registration(
            disabled_action.clone(),
            Arc::new(AtomicUsize::new(0)),
            ProbeBehavior::Disabled(disabled_reason.clone()),
            indicator.clone(),
            spec,
        ),
    ])?;
    let enabled_id = state_id("test/a-enabled-control")?;
    let disabled_id = state_id("test/z-disabled-control")?;
    let catalog = ActionStateCatalog::try_new(
        registry,
        vec![
            direct_registration(disabled_id.clone(), disabled_action),
            direct_registration(enabled_id.clone(), enabled_action),
        ],
    )?;
    let session = EditorSession::new(editor_state("catalog-direct-state", "a")?);
    let batch = catalog.derive(&session)?;

    assert_eq!(batch.entries()[0].id(), &enabled_id);
    assert_eq!(batch.entries()[1].id(), &disabled_id);
    assert_eq!(batch.entries()[0].descriptor().contract(), &state_contract);
    let enabled = resolved(&batch, &enabled_id)?;
    assert_eq!(enabled.availability(), &ObservedAvailability::Enabled);
    assert_eq!(enabled.indicator(), &indicator);
    let writes =
        enabled.actual_writes().ok_or_else(|| test_error("enabled state omitted proven writes"))?;
    assert!(writes.contains(
        ActionStateDomains::DOCUMENT | ActionStateDomains::HISTORY | ActionStateDomains::SNAPSHOT
    ));
    assert_eq!(
        enabled.indicator().value().uniform_value().and_then(ActionValue::as_string),
        Some(indicator_secret)
    );
    assert_eq!(enabled.indicator().value().contract(), Some(&contract));

    let disabled = resolved(&batch, &disabled_id)?;
    assert_eq!(disabled.availability(), &ObservedAvailability::Disabled(disabled_reason));
    assert_eq!(disabled.indicator().activation(), ActionActivation::Active);
    assert_eq!(disabled.indicator().value(), indicator.value());
    assert_eq!(disabled.actual_writes(), None);
    assert!(matches!(disabled.provenance(), ActionStateProvenance::Direct { .. }));

    let debug = format!("{catalog:?}\n{batch:?}\n{:?}", batch.entry(&disabled_id));
    assert!(!debug.contains(indicator_secret));
    assert!(!debug.contains(reason_secret));
    Ok(())
}

#[test]
#[allow(clippy::too_many_lines)]
fn routed_batches_retain_selected_blocked_and_unhandled_provenance() -> TestResult {
    let fallthrough_secret = "secret-route-detail";
    let fallthrough_reason = DisabledReason::new(
        name("test/try-next-binding")?,
        Some(ActionValue::try_from_string(fallthrough_secret)?),
    );
    let blocked_reason = DisabledReason::new(name("test/route-blocked")?, None);
    let fallback_action = action_id("test/fallback-disabled")?;
    let blocker_action = action_id("test/blocker-disabled")?;
    let enabled_action = action_id("test/routed-enabled")?;
    let registry = ActionRegistry::try_new(vec![
        probe_registration(
            fallback_action.clone(),
            Arc::new(AtomicUsize::new(0)),
            ProbeBehavior::Disabled(fallthrough_reason.clone()),
            ActionStateIndicator::stateless(),
            ActionStateSpec::stateless(),
        ),
        probe_registration(
            blocker_action.clone(),
            Arc::new(AtomicUsize::new(0)),
            ProbeBehavior::Disabled(blocked_reason.clone()),
            ActionStateIndicator::stateless(),
            ActionStateSpec::stateless(),
        ),
        probe_registration(
            enabled_action.clone(),
            Arc::new(AtomicUsize::new(0)),
            ProbeBehavior::Insert("x"),
            ActionStateIndicator::stateless(),
            ActionStateSpec::stateless(),
        ),
    ])?;
    let prepared_intent = intent_id("test/prepared-intent")?;
    let blocked_intent = intent_id("test/blocked-intent")?;
    let unhandled_intent = intent_id("test/unhandled-intent")?;
    let prepared_fallthrough = binding(
        "test/prepared-fallthrough",
        &prepared_intent,
        &fallback_action,
        20,
        DisabledRouting::FallThrough,
    )?;
    let prepared_selected = binding(
        "test/prepared-selected",
        &prepared_intent,
        &enabled_action,
        10,
        DisabledRouting::Block,
    )?;
    let blocked_fallthrough = binding(
        "test/blocked-fallthrough",
        &blocked_intent,
        &fallback_action,
        20,
        DisabledRouting::FallThrough,
    )?;
    let blocked_selected = binding(
        "test/blocked-selected",
        &blocked_intent,
        &blocker_action,
        10,
        DisabledRouting::Block,
    )?;
    let unhandled_fallthrough = binding(
        "test/unhandled-fallthrough",
        &unhandled_intent,
        &fallback_action,
        20,
        DisabledRouting::FallThrough,
    )?;
    let router = IntentRouter::try_new(
        registry,
        vec![
            IntentDeclaration::new(unhandled_intent.clone()),
            IntentDeclaration::new(prepared_intent.clone()),
            IntentDeclaration::new(blocked_intent.clone()),
        ],
        vec![
            blocked_selected.clone(),
            prepared_selected.clone(),
            unhandled_fallthrough.clone(),
            prepared_fallthrough.clone(),
            blocked_fallthrough.clone(),
        ],
    )?;
    let prepared_id = state_id("test/a-prepared-route")?;
    let blocked_id = state_id("test/b-blocked-route")?;
    let unhandled_id = state_id("test/c-unhandled-route")?;
    let catalog = ActionStateCatalog::try_new_with_router(
        router,
        vec![
            routed_registration(unhandled_id.clone(), unhandled_intent.clone()),
            routed_registration(prepared_id.clone(), prepared_intent.clone()),
            routed_registration(blocked_id.clone(), blocked_intent.clone()),
        ],
    )?;
    let session = EditorSession::new(editor_state("catalog-routed-state", "a")?);
    let batch = catalog.derive(&session)?;
    assert_eq!(batch.summary().resolved_count(), 2);
    assert_eq!(batch.summary().unhandled_count(), 1);
    assert_eq!(batch.summary().fallthrough_count(), 3);

    let prepared = resolved(&batch, &prepared_id)?;
    assert_eq!(prepared.availability(), &ObservedAvailability::Enabled);
    let ActionStateProvenance::Routed { intent, binding, fallthroughs } = prepared.provenance()
    else {
        return Err(test_error("prepared route omitted routed provenance").into());
    };
    assert_eq!(intent, &prepared_intent);
    assert_eq!(binding, &prepared_selected);
    assert_eq!(fallthroughs.len(), 1);
    assert_eq!(fallthroughs[0].binding_id(), prepared_fallthrough.id());
    assert_eq!(fallthroughs[0].reason(), &fallthrough_reason);
    assert!(
        prepared
            .actual_writes()
            .is_some_and(|writes| writes.contains(ActionStateDomains::DOCUMENT))
    );

    let blocked = resolved(&batch, &blocked_id)?;
    assert_eq!(blocked.availability(), &ObservedAvailability::Blocked(blocked_reason));
    assert_eq!(blocked.actual_writes(), None);
    let ActionStateProvenance::Routed { intent, binding, fallthroughs } = blocked.provenance()
    else {
        return Err(test_error("blocked route omitted routed provenance").into());
    };
    assert_eq!(intent, &blocked_intent);
    assert_eq!(binding, &blocked_selected);
    assert_eq!(fallthroughs.len(), 1);
    assert_eq!(fallthroughs[0].binding_id(), blocked_fallthrough.id());

    let unhandled_entry =
        batch.entry(&unhandled_id).ok_or_else(|| test_error("missing unhandled route entry"))?;
    let ActionStateOutcome::Unhandled(unhandled) = unhandled_entry.outcome() else {
        return Err(test_error("all-fallthrough route was not unhandled").into());
    };
    assert_eq!(unhandled.intent(), &unhandled_intent);
    assert_eq!(unhandled.fallthroughs().len(), 1);
    assert_eq!(unhandled.fallthroughs()[0].binding_id(), unhandled_fallthrough.id());
    assert_eq!(unhandled.fallthroughs()[0].reason(), &fallthrough_reason);

    let debug = format!(
        "{batch:?}\n{prepared:?}\n{blocked:?}\n{unhandled:?}\n{:?}",
        unhandled.fallthroughs()
    );
    assert!(!debug.contains(fallthrough_secret));
    Ok(())
}

#[test]
fn one_fault_is_retained_without_suppressing_successful_siblings() -> TestResult {
    let fault_secret = "secret-fault-detail";
    let fault_action = action_id("test/faulting-action")?;
    let good_action = action_id("test/good-action")?;
    let fault_counter = Arc::new(AtomicUsize::new(0));
    let good_counter = Arc::new(AtomicUsize::new(0));
    let fault = ActionFault::new(
        name("test/deterministic-fault")?,
        Some(ActionValue::try_from_string(fault_secret)?),
    );
    let registry = ActionRegistry::try_new(vec![
        probe_registration(
            fault_action.clone(),
            fault_counter.clone(),
            ProbeBehavior::Fault(fault.clone()),
            ActionStateIndicator::stateless(),
            ActionStateSpec::stateless(),
        ),
        probe_registration(
            good_action.clone(),
            good_counter.clone(),
            ProbeBehavior::Insert("x"),
            ActionStateIndicator::stateless(),
            ActionStateSpec::stateless(),
        ),
    ])?;
    let fault_id = state_id("test/a-fault")?;
    let good_id = state_id("test/z-good")?;
    let catalog = ActionStateCatalog::try_new(
        registry,
        vec![
            direct_registration(good_id.clone(), good_action),
            direct_registration(fault_id.clone(), fault_action.clone()),
        ],
    )?;
    let session = EditorSession::new(editor_state("catalog-fault-isolation", "a")?);
    let batch = catalog.derive(&session)?;
    assert_eq!(fault_counter.load(Ordering::SeqCst), 1);
    assert_eq!(good_counter.load(Ordering::SeqCst), 1);
    assert_eq!(batch.summary().entry_count(), 2);
    assert_eq!(batch.summary().fault_count(), 1);
    assert_eq!(batch.summary().resolved_count(), 1);
    assert!(resolved(&batch, &good_id)?.availability().is_enabled());

    let fault_entry = batch.entry(&fault_id).ok_or_else(|| test_error("missing fault entry"))?;
    let ActionStateOutcome::Fault(ActionStateFault::Direct { action, source }) =
        fault_entry.outcome()
    else {
        return Err(test_error("handler fault was not retained as a direct entry fault").into());
    };
    assert_eq!(action, &fault_action);
    assert_eq!(source, &ActionStateActionFault::Handler(fault));
    assert!(!format!("{fault_entry:?}\n{batch:?}").contains(fault_secret));
    Ok(())
}

#[test]
fn transaction_failures_are_bounded_typed_projections_without_document_payloads() -> TestResult {
    let secret = "secret";
    let operation_state = editor_state("catalog-projected-operation", secret)?;
    let start = TextOffset::try_new(0)?;
    let end = TextOffset::try_new(6)?;
    let range = TextRange::try_new(NodePath::try_from_indices(vec![0])?, start, end)?;
    let replacement = TextFragment::from(TextRun::try_new("x", FormatSet::default())?);
    let operation = TextSplice::capture(
        operation_state.context(),
        operation_state.document(),
        range,
        replacement,
    )?;
    let plan = ActionPlan::new(
        vec![operation.into()],
        SelectionRelocationPolicy::default(),
        SelectionUpdate::Relocate,
        PendingFormatsUpdate::Preserve,
        HistoryIntent::Record,
    );
    let action = action_id("test/project-invalid-transaction")?;
    let registry = ActionRegistry::try_new(vec![ActionRegistration::without_input(
        action.clone(),
        FixedPlanAction { plan },
    )])?;
    let id = state_id("test/project-invalid-transaction-control")?;
    let catalog = ActionStateCatalog::try_new(
        registry,
        vec![direct_registration(id.clone(), action.clone())],
    )?;
    let session = EditorSession::new(editor_state("catalog-projected-operation", "public")?);
    let batch = catalog.derive(&session)?;
    let entry = batch.entry(&id).ok_or_else(|| test_error("missing projected fault entry"))?;

    assert_eq!(
        entry.outcome(),
        &ActionStateOutcome::Fault(ActionStateFault::Direct {
            action,
            source: ActionStateActionFault::InvalidPlan(ActionStatePlanFault::Transaction(
                ActionStateTransactionFault::Operation {
                    operation_index: 0,
                    source: ActionStateOperationFault::TextSpliceExpectedRemovedMismatch,
                },
            )),
        })
    );
    assert_eq!(batch.summary().value_count(), 0);
    assert_eq!(batch.summary().text_bytes(), 0);
    assert!(!format!("{entry:?}\n{batch:?}").contains(secret));
    Ok(())
}

#[test]
fn root_text_failures_are_bounded_typed_projections_without_guard_payloads() -> TestResult {
    let secret = "root-secret";
    let operation_state = editor_state("catalog-projected-root-operation", secret)?;
    let paragraph_path = NodePath::try_from_indices(vec![0])?;
    let range = RootTextRange::try_new(
        RootTextBoundary::try_new(paragraph_path.clone(), TextOffset::ZERO)?,
        RootTextBoundary::try_new(
            paragraph_path,
            TextOffset::try_new(u64::try_from(secret.encode_utf16().count())?)?,
        )?,
    )?;
    let replacement = TextFragment::from(TextRun::try_new("x", FormatSet::default())?);
    let operation = RootTextReplace::capture(
        operation_state.context(),
        operation_state.document(),
        range,
        vec![replacement],
    )?;
    let plan = ActionPlan::new(
        vec![operation.into()],
        SelectionRelocationPolicy::default(),
        SelectionUpdate::Relocate,
        PendingFormatsUpdate::Preserve,
        HistoryIntent::Record,
    );
    let action = action_id("test/project-invalid-root-transaction")?;
    let registry = ActionRegistry::try_new(vec![ActionRegistration::without_input(
        action.clone(),
        FixedPlanAction { plan },
    )])?;
    let id = state_id("test/project-invalid-root-transaction-control")?;
    let catalog = ActionStateCatalog::try_new(
        registry,
        vec![direct_registration(id.clone(), action.clone())],
    )?;
    let session =
        EditorSession::new(editor_state("catalog-projected-root-operation", "public-data")?);
    let batch = catalog.derive(&session)?;
    let entry = batch.entry(&id).ok_or_else(|| test_error("missing projected fault entry"))?;

    assert_eq!(
        entry.outcome(),
        &ActionStateOutcome::Fault(ActionStateFault::Direct {
            action,
            source: ActionStateActionFault::InvalidPlan(ActionStatePlanFault::Transaction(
                ActionStateTransactionFault::Operation {
                    operation_index: 0,
                    source: ActionStateOperationFault::RootTextReplaceExpectedMismatch,
                },
            )),
        })
    );
    assert_eq!(batch.summary().value_count(), 0);
    assert_eq!(batch.summary().text_bytes(), 0);
    assert!(!format!("{entry:?}\n{batch:?}").contains(secret));
    Ok(())
}

#[test]
fn history_availability_is_authoritative_and_prior_batches_stay_immutable() -> TestResult {
    let undo_id = state_id("test/undo-control")?;
    let redo_id = state_id("test/redo-control")?;
    let catalog = ActionStateCatalog::try_new(
        ActionRegistry::default(),
        vec![
            history_registration(undo_id.clone(), ReplayDirection::Undo),
            history_registration(redo_id.clone(), ReplayDirection::Redo),
        ],
    )?;
    let initial_state = editor_state("catalog-history-state", "a")?;
    let mut session = EditorSession::new(initial_state.clone());
    let initial_status = session.history_status();
    let initial = catalog.derive(&session)?;
    let initial_copy = initial.clone();
    assert_eq!(session.history_status(), initial_status);
    assert_eq!(initial.base_state(), &initial_state);
    assert_eq!(initial.history_status(), &initial_status);
    assert_eq!(
        unavailable_code(&initial, &undo_id)?.map(QualifiedName::as_str),
        Some("breditor/nothing-to-undo")
    );
    assert_eq!(
        unavailable_code(&initial, &redo_id)?.map(QualifiedName::as_str),
        Some("breditor/nothing-to-redo")
    );

    publish_insertion(&mut session, "x")?;
    let committed_status = session.history_status();
    assert_ne!(committed_status.stamp(), initial_status.stamp());
    let committed = catalog.derive(&session)?;
    assert_eq!(session.history_status(), committed_status);
    assert!(resolved(&committed, &undo_id)?.availability().is_enabled());
    assert_eq!(
        unavailable_code(&committed, &redo_id)?.map(QualifiedName::as_str),
        Some("breditor/nothing-to-redo")
    );
    let undo_writes = resolved(&committed, &undo_id)?
        .actual_writes()
        .ok_or_else(|| test_error("enabled undo omitted proven writes"))?;
    assert!(undo_writes.contains(
        ActionStateDomains::DOCUMENT | ActionStateDomains::HISTORY | ActionStateDomains::SNAPSHOT
    ));

    if session.undo()?.is_none() {
        return Err(test_error("undo unexpectedly unavailable").into());
    }
    let undone_status = session.history_status();
    let undone = catalog.derive(&session)?;
    assert_eq!(session.history_status(), undone_status);
    assert_eq!(
        unavailable_code(&undone, &undo_id)?.map(QualifiedName::as_str),
        Some("breditor/nothing-to-undo")
    );
    assert!(resolved(&undone, &redo_id)?.availability().is_enabled());

    assert_eq!(initial, initial_copy);
    assert_eq!(initial.base_state(), &initial_state);
    assert_eq!(initial.history_status().stamp(), initial_status.stamp());
    assert_ne!(initial.history_status().stamp(), committed.history_status().stamp());
    assert_ne!(committed.history_status().stamp(), undone.history_status().stamp());
    Ok(())
}

#[test]
fn entry_count_limits_are_fixed_and_the_exact_boundary_is_accepted() -> TestResult {
    let maximum = usize::try_from(MAX_ACTION_STATE_ENTRIES)?;
    let registrations = (0..maximum)
        .map(|index| {
            state_id(&format!("test/boundary-control-{index:04}"))
                .map(|id| history_registration(id, ReplayDirection::Undo))
        })
        .collect::<Result<Vec<_>, _>>()?;
    let catalog = ActionStateCatalog::try_new(ActionRegistry::default(), registrations)?;
    assert_eq!(catalog.len(), maximum);

    let repeated =
        history_registration(state_id("test/repeated-over-limit")?, ReplayDirection::Undo);
    let over_limit = vec![repeated; maximum.saturating_add(1)];
    assert_eq!(
        ActionStateCatalog::try_new(ActionRegistry::default(), over_limit).err(),
        Some(ActionStateCatalogError::TooManyEntries {
            actual: MAX_ACTION_STATE_ENTRIES + 1,
            maximum: MAX_ACTION_STATE_ENTRIES,
        })
    );
    Ok(())
}

#[test]
fn aggregate_fixed_input_text_limit_reports_the_complete_rejected_total() -> TestResult {
    let contract = input_contract("test/large-fixed-input")?;
    let action = action_id("test/large-input-action")?;
    let reason = DisabledReason::new(name("test/large-input-disabled")?, None);
    let registry = ActionRegistry::try_new(vec![ActionRegistration::with_input(
        action.clone(),
        contract.clone(),
        TypedDisabledAction { reason },
    )])?;
    let value =
        ActionValue::try_from_string("x".repeat(usize::try_from(MAX_ACTION_VALUE_TEXT_BYTES)?))?;
    let values_at_limit =
        usize::try_from(MAX_ACTION_STATE_INPUT_TEXT_BYTES / MAX_ACTION_VALUE_TEXT_BYTES)?;
    let registration = |index: usize| -> Result<ActionStateRegistration, Box<dyn Error>> {
        Ok(ActionStateRegistration::new(
            state_id(&format!("test/large-input-control-{index:02}"))?,
            ActionStateSource::direct(ActionInvocation::new(
                action.clone(),
                ActionInput::typed(contract.clone(), value.clone()),
            )),
        ))
    };
    let exact = (0..values_at_limit).map(&registration).collect::<Result<Vec<_>, _>>()?;
    let catalog = ActionStateCatalog::try_new(registry.clone(), exact)?;
    assert_eq!(catalog.len(), values_at_limit);

    let extra_values = 3_u64;
    let over = (0..values_at_limit.saturating_add(usize::try_from(extra_values)?))
        .map(registration)
        .collect::<Result<Vec<_>, _>>()?;
    assert_eq!(
        ActionStateCatalog::try_new(registry, over).err(),
        Some(ActionStateCatalogError::InputTextBytes {
            actual: MAX_ACTION_STATE_INPUT_TEXT_BYTES + extra_values * MAX_ACTION_VALUE_TEXT_BYTES,
            maximum: MAX_ACTION_STATE_INPUT_TEXT_BYTES,
        })
    );
    Ok(())
}

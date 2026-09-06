//! Black-box contracts for exact-basis action-state cache refreshes.

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
        ActionInputError, ActionInputVersion, ActionInvocation, ActionRegistration, ActionRegistry,
        ActionStateBatch, ActionStateCache, ActionStateCacheUpdate, ActionStateCatalog,
        ActionStateContract, ActionStateDelta, ActionStateDeriveError, ActionStateDomains,
        ActionStateId, ActionStateIndicator, ActionStateOutcome, ActionStateRegistration,
        ActionStateSource, ActionStateSpec, ActionStateValue, ActionStateValueContract,
        ActionStateValueVersion, ActionValue, DecodeActionInput, DisabledReason,
        MAX_ACTION_STATE_BATCH_TEXT_BYTES, MAX_ACTION_VALUE_TEXT_BYTES, ObservedAvailability,
        ResolvedActionState, TypedActionInput,
        routing::{
            BindingId, BindingPriority, DisabledRouting, IntentBinding, IntentDeclaration,
            IntentId, IntentInvocation, IntentRouter,
        },
    },
    codec::DocumentJsonCodec,
    document::{Document, FormatSet, TextFragment, TextRun},
    identity::QualifiedName,
    operation::{Operation, TextRange, TextSplice},
    position::{Affinity, NodePath, Point, TextOffset},
    selection::{RangeSelection, Selection},
    session::EditorSession,
    state::{EditorContext, EditorState, LineageId, Revision},
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
    editor_state_with_context(&context, lineage, text)
}

fn editor_state_with_context(
    context: &EditorContext,
    lineage: &str,
    text: &str,
) -> Result<EditorState, Box<dyn Error>> {
    let children = if text.is_empty() { Vec::new() } else { vec![text_node(text, false)] };
    let document = DocumentJsonCodec::new(context.schema().clone())
        .with_limits(context.limits().clone())
        .decode(&document_json(&[paragraph(&children)]))?;
    EditorState::try_new(context, LineageId::try_new(lineage)?, document, None, None)
        .map_err(Into::into)
}

fn selection(start: u32, end: u32) -> Result<Selection, Box<dyn Error>> {
    let text_path = NodePath::try_from_indices(vec![0, 0])?;
    Ok(RangeSelection::new(
        Point::Text {
            text_path: text_path.clone(),
            utf16_offset: start,
            affinity: Affinity::Before,
        },
        Point::Text { text_path, utf16_offset: end, affinity: Affinity::After },
    )
    .into())
}

fn publish_selection(session: &mut EditorSession, requested: Selection) -> TestResult {
    let transaction = Transaction::new(session.state(), Vec::new())
        .with_selection_update(SelectionUpdate::Set(Some(requested)));
    if session.apply_transaction(&transaction)?.into_commit().is_none() {
        return Err(test_error("selection transaction was unexpectedly unchanged").into());
    }
    Ok(())
}

fn publish_pending_formats(session: &mut EditorSession, formats: FormatSet) -> TestResult {
    let transaction = Transaction::new(session.state(), Vec::new())
        .with_pending_formats_update(PendingFormatsUpdate::Set(Some(formats)));
    if session.apply_transaction(&transaction)?.into_commit().is_none() {
        return Err(test_error("pending-format transaction was unexpectedly unchanged").into());
    }
    Ok(())
}

fn insertion_operation(state: &EditorState, text: &str) -> Result<Operation, Box<dyn Error>> {
    let start = TextOffset::ZERO;
    let range = TextRange::try_new(NodePath::try_from_indices(vec![0])?, start, start)?;
    let run = TextRun::try_new(text, FormatSet::default())?;
    TextSplice::capture(state.context(), state.document(), range, TextFragment::from(run))
        .map(Operation::from)
        .map_err(Into::into)
}

fn publish_insertion(
    session: &mut EditorSession,
    text: &str,
    history: HistoryIntent,
) -> TestResult {
    let transaction =
        Transaction::new(session.state(), vec![insertion_operation(session.state(), text)?])
            .with_metadata(TransactionMetadata::new(None, history));
    if session.apply_transaction(&transaction)?.into_commit().is_none() {
        return Err(test_error("insertion transaction was unexpectedly unchanged").into());
    }
    Ok(())
}

fn direct_registration(id: ActionStateId, invocation: ActionInvocation) -> ActionStateRegistration {
    ActionStateRegistration::new(id, ActionStateSource::direct(invocation))
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

fn delta(update: &ActionStateCacheUpdate) -> Result<&ActionStateDelta, Box<dyn Error>> {
    update.delta().ok_or_else(|| test_error("cache update omitted its expected delta").into())
}

#[derive(Clone)]
enum ProbeIndicator {
    Stateless,
    SelectionPresence,
    PendingFormatsPresence,
    DocumentMatch(Document),
    RevisionValue {
        contract: ActionStateValueContract,
        initial: ActionValue,
        advanced: ActionValue,
    },
}

#[derive(Clone)]
struct DisabledProbe {
    evaluations: Arc<AtomicUsize>,
    reason: DisabledReason,
    indicator: ProbeIndicator,
}

impl Action for DisabledProbe {
    type Input = ();

    fn evaluate(
        &self,
        state: &EditorState,
        (): &Self::Input,
    ) -> Result<ActionEvaluation, ActionFault> {
        self.evaluations.fetch_add(1, Ordering::SeqCst);
        let indicator = match &self.indicator {
            ProbeIndicator::Stateless => ActionStateIndicator::stateless(),
            ProbeIndicator::SelectionPresence => ActionStateIndicator::new(
                if state.selection().is_some() {
                    ActionActivation::Active
                } else {
                    ActionActivation::Inactive
                },
                ActionStateValue::Unsupported,
            ),
            ProbeIndicator::PendingFormatsPresence => ActionStateIndicator::new(
                if state.pending_formats().is_some() {
                    ActionActivation::Active
                } else {
                    ActionActivation::Inactive
                },
                ActionStateValue::Unsupported,
            ),
            ProbeIndicator::DocumentMatch(expected) => ActionStateIndicator::new(
                if state.document() == expected {
                    ActionActivation::Active
                } else {
                    ActionActivation::Inactive
                },
                ActionStateValue::Unsupported,
            ),
            ProbeIndicator::RevisionValue { contract, initial, advanced } => {
                let value = if state.snapshot().revision() == Revision::ZERO {
                    initial.clone()
                } else {
                    advanced.clone()
                };
                ActionStateIndicator::new(
                    ActionActivation::Stateless,
                    ActionStateValue::uniform(contract.clone(), value),
                )
            }
        };
        Ok(ActionEvaluation::new(ActionDecision::Disabled(self.reason.clone()), indicator))
    }
}

fn probe_registration(
    id: ActionId,
    evaluations: Arc<AtomicUsize>,
    reason: DisabledReason,
    indicator: ProbeIndicator,
    spec: ActionStateSpec,
) -> ActionRegistration {
    ActionRegistration::without_input(id, DisabledProbe { evaluations, reason, indicator })
        .with_state_spec(spec)
}

#[derive(Clone)]
struct FaultProbe {
    evaluations: Arc<AtomicUsize>,
    fault: ActionFault,
}

impl Action for FaultProbe {
    type Input = ();

    fn evaluate(&self, _: &EditorState, (): &Self::Input) -> Result<ActionEvaluation, ActionFault> {
        self.evaluations.fetch_add(1, Ordering::SeqCst);
        Err(self.fault.clone())
    }
}

#[derive(Clone, Copy)]
struct BooleanInput(bool);

impl DecodeActionInput for BooleanInput {
    fn decode(
        registered_contract: Option<&ActionInputContract>,
        input: &ActionInput,
    ) -> Result<Self, ActionInputError> {
        let Some(expected) = registered_contract else {
            return Err(ActionInputError::MissingRegisteredContract);
        };
        let ActionInput::Typed { value, .. } = input else {
            return Err(ActionInputError::ExpectedTyped { expected: expected.clone() });
        };
        value
            .as_boolean()
            .map(Self)
            .ok_or_else(|| ActionInputError::InvalidValue { code: expected.name().clone() })
    }
}

impl TypedActionInput for BooleanInput {}

#[derive(Clone)]
struct BooleanProbe {
    evaluations: Arc<AtomicUsize>,
    reason_code: QualifiedName,
}

impl Action for BooleanProbe {
    type Input = BooleanInput;

    fn evaluate(
        &self,
        _: &EditorState,
        input: &Self::Input,
    ) -> Result<ActionEvaluation, ActionFault> {
        self.evaluations.fetch_add(1, Ordering::SeqCst);
        Ok(ActionEvaluation::stateless(ActionDecision::Disabled(DisabledReason::new(
            self.reason_code.clone(),
            Some(ActionValue::boolean(input.0)),
        ))))
    }
}

#[test]
#[allow(clippy::too_many_lines)]
fn exact_hits_domain_invalidation_clear_fault_caching_and_debug_redaction_are_coherent()
-> TestResult {
    let reason_secret = "secret-cache-disabled-detail";
    let fault_secret = "secret-cache-fault-detail";
    let reason = DisabledReason::new(
        name("test/cache-disabled")?,
        Some(ActionValue::try_from_string(reason_secret)?),
    );
    let selection_action = action_id("test/cache-selection-action")?;
    let document_action = action_id("test/cache-document-action")?;
    let snapshot_action = action_id("test/cache-snapshot-action")?;
    let fault_action = action_id("test/cache-fault-action")?;
    let selection_evaluations = Arc::new(AtomicUsize::new(0));
    let document_evaluations = Arc::new(AtomicUsize::new(0));
    let snapshot_evaluations = Arc::new(AtomicUsize::new(0));
    let fault_evaluations = Arc::new(AtomicUsize::new(0));
    let tracked = ActionStateContract::new(ActionActivationContract::Tracked, None);
    let registry = ActionRegistry::try_new(vec![
        probe_registration(
            selection_action.clone(),
            selection_evaluations.clone(),
            reason.clone(),
            ProbeIndicator::SelectionPresence,
            ActionStateSpec::new(
                tracked,
                ActionEffects::new(ActionStateDomains::SELECTION, ActionStateDomains::NONE),
            ),
        ),
        probe_registration(
            document_action.clone(),
            document_evaluations.clone(),
            reason.clone(),
            ProbeIndicator::Stateless,
            ActionStateSpec::new(
                ActionStateContract::stateless(),
                ActionEffects::new(ActionStateDomains::DOCUMENT, ActionStateDomains::NONE),
            ),
        ),
        probe_registration(
            snapshot_action.clone(),
            snapshot_evaluations.clone(),
            reason,
            ProbeIndicator::Stateless,
            ActionStateSpec::new(
                ActionStateContract::stateless(),
                ActionEffects::new(ActionStateDomains::SNAPSHOT, ActionStateDomains::NONE),
            ),
        ),
        ActionRegistration::without_input(
            fault_action.clone(),
            FaultProbe {
                evaluations: fault_evaluations.clone(),
                fault: ActionFault::new(
                    name("test/cache-fault")?,
                    Some(ActionValue::try_from_string(fault_secret)?),
                ),
            },
        )
        .with_state_spec(ActionStateSpec::new(
            ActionStateContract::stateless(),
            ActionEffects::new(ActionStateDomains::DOCUMENT, ActionStateDomains::NONE),
        )),
    ])?;
    let selection_first = state_id("test/a-selection")?;
    let document_id = state_id("test/m-document")?;
    let fault_id = state_id("test/n-fault")?;
    let snapshot_id = state_id("test/o-snapshot")?;
    let selection_last = state_id("test/z-selection")?;
    let selection_source = ActionInvocation::without_input(selection_action);
    let catalog = ActionStateCatalog::try_new(
        registry,
        vec![
            direct_registration(selection_last.clone(), selection_source.clone()),
            direct_registration(
                document_id.clone(),
                ActionInvocation::without_input(document_action),
            ),
            direct_registration(selection_first.clone(), selection_source),
            direct_registration(
                snapshot_id.clone(),
                ActionInvocation::without_input(snapshot_action),
            ),
            direct_registration(fault_id.clone(), ActionInvocation::without_input(fault_action)),
        ],
    )?;
    let mut session = EditorSession::new(editor_state("cache-domain-selective", "abc")?);
    let mut cache = ActionStateCache::new(catalog);
    assert!(cache.current().is_none());

    let full = cache.refresh(&session)?;
    assert!(full.is_full());
    assert!(!full.is_unchanged());
    assert!(!full.is_delta());
    assert!(full.delta().is_none());
    assert_eq!(selection_evaluations.load(Ordering::SeqCst), 1);
    assert_eq!(document_evaluations.load(Ordering::SeqCst), 1);
    assert_eq!(snapshot_evaluations.load(Ordering::SeqCst), 1);
    assert_eq!(fault_evaluations.load(Ordering::SeqCst), 1);
    let first_observation = full.observation().clone();
    assert_eq!(
        resolved(first_observation.batch(), &selection_first)?.indicator().activation(),
        ActionActivation::Inactive
    );

    let unchanged = cache.refresh(&session)?;
    assert!(unchanged.is_unchanged());
    assert_eq!(unchanged.observation().id(), first_observation.id());
    assert!(Arc::ptr_eq(unchanged.observation().shared_batch(), first_observation.shared_batch()));
    assert_eq!(selection_evaluations.load(Ordering::SeqCst), 1);
    assert_eq!(document_evaluations.load(Ordering::SeqCst), 1);
    assert_eq!(snapshot_evaluations.load(Ordering::SeqCst), 1);
    assert_eq!(fault_evaluations.load(Ordering::SeqCst), 1);

    publish_selection(&mut session, selection(1, 1)?)?;
    let changed = cache.refresh(&session)?;
    assert!(changed.is_delta());
    let selection_delta = delta(&changed)?;
    assert_eq!(selection_delta.prior_id(), first_observation.id());
    assert_eq!(selection_delta.new_id(), changed.observation().id());
    assert_eq!(
        selection_delta.changed_basis_domains(),
        ActionStateDomains::SELECTION | ActionStateDomains::HISTORY | ActionStateDomains::SNAPSHOT
    );
    assert_eq!(selection_delta.changed_ids(), &[selection_first.clone(), selection_last.clone()]);
    assert_eq!(selection_evaluations.load(Ordering::SeqCst), 2);
    assert_eq!(document_evaluations.load(Ordering::SeqCst), 1);
    assert_eq!(snapshot_evaluations.load(Ordering::SeqCst), 2);
    assert_eq!(fault_evaluations.load(Ordering::SeqCst), 1);
    assert_eq!(
        resolved(changed.observation().batch(), &selection_last)?.indicator().activation(),
        ActionActivation::Active
    );
    assert!(!selection_delta.changed_ids().contains(&snapshot_id));
    assert!(!selection_delta.changed_ids().contains(&document_id));
    assert!(!selection_delta.changed_ids().contains(&fault_id));

    let debug = format!(
        "{cache:?}\n{full:?}\n{changed:?}\n{:?}\n{:?}",
        first_observation.batch().entry(&selection_first),
        first_observation.batch().entry(&fault_id)
    );
    assert!(!debug.contains(reason_secret));
    assert!(!debug.contains(fault_secret));

    let changed_observation = changed.observation().clone();
    assert!(cache.clear());
    assert!(cache.current().is_none());
    assert!(!cache.clear());
    let rebuilt = cache.refresh(&session)?;
    assert!(rebuilt.is_full());
    assert_ne!(rebuilt.observation().id(), changed_observation.id());
    assert_eq!(selection_evaluations.load(Ordering::SeqCst), 3);
    assert_eq!(document_evaluations.load(Ordering::SeqCst), 2);
    assert_eq!(snapshot_evaluations.load(Ordering::SeqCst), 3);
    assert_eq!(fault_evaluations.load(Ordering::SeqCst), 2);
    Ok(())
}

#[test]
fn duplicate_direct_sources_coalesce_but_inputs_and_routing_remain_separate() -> TestResult {
    let contract = input_contract("test/cache-boolean-input")?;
    let action = action_id("test/cache-boolean-action")?;
    let intent = intent_id("test/cache-boolean-intent")?;
    let evaluations = Arc::new(AtomicUsize::new(0));
    let registry = ActionRegistry::try_new(vec![ActionRegistration::with_input(
        action.clone(),
        contract.clone(),
        BooleanProbe {
            evaluations: evaluations.clone(),
            reason_code: name("test/cache-boolean-disabled")?,
        },
    )])?;
    let router = IntentRouter::try_new(
        registry,
        vec![IntentDeclaration::with_input(intent.clone(), contract.clone())],
        vec![IntentBinding::new(
            binding_id("test/cache-boolean-binding")?,
            intent.clone(),
            action.clone(),
            BindingPriority::new(0),
            DisabledRouting::Block,
        )],
    )?;
    let direct_true_first = state_id("test/a-direct-true")?;
    let direct_true_last = state_id("test/b-direct-true")?;
    let direct_false = state_id("test/c-direct-false")?;
    let routed_true = state_id("test/d-routed-true")?;
    let true_input = ActionInput::typed(contract.clone(), ActionValue::boolean(true));
    let false_input = ActionInput::typed(contract.clone(), ActionValue::boolean(false));
    let catalog = ActionStateCatalog::try_new_with_router(
        router,
        vec![
            direct_registration(
                direct_true_last.clone(),
                ActionInvocation::new(action.clone(), true_input.clone()),
            ),
            direct_registration(
                direct_false.clone(),
                ActionInvocation::new(action.clone(), false_input),
            ),
            ActionStateRegistration::new(
                routed_true.clone(),
                ActionStateSource::routed(IntentInvocation::new(intent, true_input.clone())),
            ),
            direct_registration(
                direct_true_first.clone(),
                ActionInvocation::new(action, true_input),
            ),
        ],
    )?;
    let session = EditorSession::new(editor_state("cache-source-groups", "abc")?);
    let mut cache = ActionStateCache::new(catalog.clone());
    let full = cache.refresh(&session)?;
    assert!(full.is_full());
    assert_eq!(evaluations.load(Ordering::SeqCst), 3);
    assert_eq!(
        resolved(full.observation().batch(), &direct_true_first)?
            .availability()
            .reason()
            .and_then(DisabledReason::detail)
            .and_then(ActionValue::as_boolean),
        Some(true)
    );
    assert_eq!(
        resolved(full.observation().batch(), &direct_true_last)?.availability(),
        resolved(full.observation().batch(), &direct_true_first)?.availability()
    );
    assert_eq!(
        resolved(full.observation().batch(), &direct_false)?
            .availability()
            .reason()
            .and_then(DisabledReason::detail)
            .and_then(ActionValue::as_boolean),
        Some(false)
    );
    assert!(matches!(
        resolved(full.observation().batch(), &routed_true)?.availability(),
        ObservedAvailability::Blocked(_)
    ));

    let uncached = catalog.derive(&session)?;
    assert_eq!(uncached.summary().entry_count(), 4);
    assert_eq!(full.observation().batch(), &uncached);
    assert_eq!(evaluations.load(Ordering::SeqCst), 7);
    let unchanged = cache.refresh(&session)?;
    assert!(unchanged.is_unchanged());
    assert_eq!(evaluations.load(Ordering::SeqCst), 7);
    Ok(())
}

#[test]
fn equal_snapshot_ids_do_not_hide_unequal_complete_editor_states() -> TestResult {
    let context = EditorContext::default();
    let first_state = editor_state_with_context(&context, "cache-reused-snapshot", "first")?;
    let second_state = editor_state_with_context(&context, "cache-reused-snapshot", "second")?;
    assert_eq!(first_state.snapshot(), second_state.snapshot());
    assert_ne!(first_state, second_state);

    let action = action_id("test/cache-document-match")?;
    let evaluations = Arc::new(AtomicUsize::new(0));
    let registry = ActionRegistry::try_new(vec![probe_registration(
        action.clone(),
        evaluations.clone(),
        DisabledReason::new(name("test/cache-document-match-disabled")?, None),
        ProbeIndicator::DocumentMatch(second_state.document().clone()),
        ActionStateSpec::new(
            ActionStateContract::new(ActionActivationContract::Tracked, None),
            ActionEffects::new(ActionStateDomains::DOCUMENT, ActionStateDomains::NONE),
        ),
    )])?;
    let id = state_id("test/cache-document-match-state")?;
    let catalog = ActionStateCatalog::try_new(
        registry,
        vec![direct_registration(id.clone(), ActionInvocation::without_input(action))],
    )?;
    let first_session = EditorSession::new(first_state);
    let second_session = EditorSession::new(second_state);
    let mut cache = ActionStateCache::new(catalog);
    let first = cache.refresh(&first_session)?;
    assert_eq!(
        resolved(first.observation().batch(), &id)?.indicator().activation(),
        ActionActivation::Inactive
    );

    let second = cache.refresh(&second_session)?;
    let replacement = delta(&second)?;
    assert_eq!(
        replacement.changed_basis_domains(),
        ActionStateDomains::DOCUMENT | ActionStateDomains::HISTORY
    );
    assert!(!replacement.changed_basis_domains().contains(ActionStateDomains::SNAPSHOT));
    assert_eq!(replacement.changed_ids(), std::slice::from_ref(&id));
    assert_ne!(replacement.prior_id(), replacement.new_id());
    assert_eq!(
        resolved(second.observation().batch(), &id)?.indicator().activation(),
        ActionActivation::Active
    );
    assert_eq!(evaluations.load(Ordering::SeqCst), 2);
    Ok(())
}

#[test]
fn pending_format_changes_invalidate_their_precise_readers() -> TestResult {
    let action = action_id("test/cache-pending-formats")?;
    let evaluations = Arc::new(AtomicUsize::new(0));
    let registry = ActionRegistry::try_new(vec![probe_registration(
        action.clone(),
        evaluations.clone(),
        DisabledReason::new(name("test/cache-pending-formats-disabled")?, None),
        ProbeIndicator::PendingFormatsPresence,
        ActionStateSpec::new(
            ActionStateContract::new(ActionActivationContract::Tracked, None),
            ActionEffects::new(ActionStateDomains::PENDING_FORMATS, ActionStateDomains::NONE),
        ),
    )])?;
    let id = state_id("test/cache-pending-formats-state")?;
    let catalog = ActionStateCatalog::try_new(
        registry,
        vec![direct_registration(id.clone(), ActionInvocation::without_input(action))],
    )?;
    let mut session = EditorSession::new(editor_state("cache-pending-formats", "abc")?);
    publish_selection(&mut session, selection(1, 1)?)?;
    let mut cache = ActionStateCache::new(catalog);
    let full = cache.refresh(&session)?;
    assert_eq!(
        resolved(full.observation().batch(), &id)?.indicator().activation(),
        ActionActivation::Inactive
    );

    publish_pending_formats(&mut session, FormatSet::default())?;
    let changed = cache.refresh(&session)?;
    let pending_delta = delta(&changed)?;
    assert_eq!(
        pending_delta.changed_basis_domains(),
        ActionStateDomains::PENDING_FORMATS
            | ActionStateDomains::HISTORY
            | ActionStateDomains::SNAPSHOT
    );
    assert_eq!(pending_delta.changed_ids(), std::slice::from_ref(&id));
    assert_eq!(
        resolved(changed.observation().batch(), &id)?.indicator().activation(),
        ActionActivation::Active
    );
    assert_eq!(evaluations.load(Ordering::SeqCst), 2);
    Ok(())
}

#[test]
fn context_changes_are_classified_even_when_content_and_snapshot_match() -> TestResult {
    let first_context = EditorContext::default();
    let second_context = EditorContext::default();
    assert_eq!(first_context.schema(), second_context.schema());
    let first_state = editor_state_with_context(&first_context, "cache-context-change", "abc")?;
    let second_state = editor_state_with_context(&second_context, "cache-context-change", "abc")?;
    assert_eq!(first_state.snapshot(), second_state.snapshot());
    assert_eq!(first_state.document(), second_state.document());
    assert_ne!(first_state.context(), second_state.context());

    let action = action_id("test/cache-context")?;
    let evaluations = Arc::new(AtomicUsize::new(0));
    let registry = ActionRegistry::try_new(vec![probe_registration(
        action.clone(),
        evaluations.clone(),
        DisabledReason::new(name("test/cache-context-disabled")?, None),
        ProbeIndicator::Stateless,
        ActionStateSpec::new(
            ActionStateContract::stateless(),
            ActionEffects::new(ActionStateDomains::CONTEXT, ActionStateDomains::NONE),
        ),
    )])?;
    let id = state_id("test/cache-context-state")?;
    let catalog = ActionStateCatalog::try_new(
        registry,
        vec![direct_registration(id, ActionInvocation::without_input(action))],
    )?;
    let first_session = EditorSession::new(first_state);
    let second_session = EditorSession::new(second_state);
    let mut cache = ActionStateCache::new(catalog);
    let first = cache.refresh(&first_session)?;
    let second = cache.refresh(&second_session)?;
    let context_delta = delta(&second)?;
    assert_eq!(
        context_delta.changed_basis_domains(),
        ActionStateDomains::CONTEXT | ActionStateDomains::HISTORY
    );
    assert!(context_delta.changed_ids().is_empty());
    assert_ne!(first.observation().id(), second.observation().id());
    assert_eq!(evaluations.load(Ordering::SeqCst), 2);
    Ok(())
}

#[test]
fn an_effective_history_boundary_invalidates_only_history_readers() -> TestResult {
    let action = action_id("test/cache-document-only")?;
    let evaluations = Arc::new(AtomicUsize::new(0));
    let registry = ActionRegistry::try_new(vec![probe_registration(
        action.clone(),
        evaluations.clone(),
        DisabledReason::new(name("test/cache-document-only-disabled")?, None),
        ProbeIndicator::Stateless,
        ActionStateSpec::new(
            ActionStateContract::stateless(),
            ActionEffects::new(ActionStateDomains::DOCUMENT, ActionStateDomains::NONE),
        ),
    )])?;
    let direct_id = state_id("test/a-document-only")?;
    let undo_id = state_id("test/z-undo")?;
    let catalog = ActionStateCatalog::try_new(
        registry,
        vec![
            direct_registration(direct_id.clone(), ActionInvocation::without_input(action)),
            history_registration(undo_id.clone(), ReplayDirection::Undo),
        ],
    )?;
    let mut session = EditorSession::new(editor_state("cache-history-only", "abc")?);
    publish_insertion(
        &mut session,
        "x",
        HistoryIntent::Merge { group: name("test/cache-open-history-group")? },
    )?;
    assert!(session.can_undo());
    let mut cache = ActionStateCache::new(catalog);
    let full = cache.refresh(&session)?;
    assert!(resolved(full.observation().batch(), &undo_id)?.availability().is_enabled());
    assert_eq!(evaluations.load(Ordering::SeqCst), 1);
    let snapshot = session.state().clone();

    session.close_history_group();
    assert_eq!(session.state(), &snapshot);
    let boundary = cache.refresh(&session)?;
    let boundary_delta = delta(&boundary)?;
    assert_eq!(boundary_delta.changed_basis_domains(), ActionStateDomains::HISTORY);
    assert!(boundary_delta.changed_ids().is_empty());
    assert!(resolved(boundary.observation().batch(), &undo_id)?.availability().is_enabled());
    assert_eq!(evaluations.load(Ordering::SeqCst), 1);

    session.clear_history();
    assert_eq!(session.state(), &snapshot);
    assert!(!session.can_undo());
    let changed = cache.refresh(&session)?;
    let history_delta = delta(&changed)?;
    assert_eq!(history_delta.changed_basis_domains(), ActionStateDomains::HISTORY);
    assert_eq!(history_delta.changed_ids(), std::slice::from_ref(&undo_id));
    assert!(!resolved(changed.observation().batch(), &undo_id)?.availability().is_enabled());
    assert_eq!(evaluations.load(Ordering::SeqCst), 1);
    assert!(!history_delta.changed_ids().contains(&direct_id));
    Ok(())
}

#[test]
#[allow(clippy::too_many_lines)]
fn aggregate_refresh_failure_is_transactional_and_duplicate_values_are_counted_logically()
-> TestResult {
    let action = action_id("test/cache-large-state")?;
    let contract = value_contract("test/cache-large-state-value")?;
    let evaluations = Arc::new(AtomicUsize::new(0));
    let initial_value = ActionValue::try_from_string("ok")?;
    let advanced_value =
        ActionValue::try_from_string("x".repeat(usize::try_from(MAX_ACTION_VALUE_TEXT_BYTES)?))?;
    let registry = ActionRegistry::try_new(vec![probe_registration(
        action.clone(),
        evaluations.clone(),
        DisabledReason::new(name("test/cache-large-state-disabled")?, None),
        ProbeIndicator::RevisionValue {
            contract: contract.clone(),
            initial: initial_value,
            advanced: advanced_value,
        },
        ActionStateSpec::new(
            ActionStateContract::new(ActionActivationContract::Stateless, Some(contract)),
            ActionEffects::new(ActionStateDomains::SNAPSHOT, ActionStateDomains::NONE),
        ),
    )])?;
    let invocation = ActionInvocation::without_input(action);
    let registrations = (0..17)
        .map(|index| {
            state_id(&format!("test/cache-large-state-{index:02}"))
                .map(|id| direct_registration(id, invocation.clone()))
        })
        .collect::<Result<Vec<_>, _>>()?;
    let catalog = ActionStateCatalog::try_new(registry, registrations)?;
    let mut session = EditorSession::new(editor_state("cache-transactional-failure", "abc")?);
    let mut cache = ActionStateCache::new(catalog);
    let full = cache.refresh(&session)?;
    let retained = full.observation().clone();
    assert_eq!(retained.batch().summary().text_bytes(), 34);
    assert_eq!(evaluations.load(Ordering::SeqCst), 1);

    publish_selection(&mut session, selection(1, 1)?)?;
    let actual = 17_u64.saturating_mul(MAX_ACTION_VALUE_TEXT_BYTES);
    let expected =
        ActionStateDeriveError::TextBytes { actual, maximum: MAX_ACTION_STATE_BATCH_TEXT_BYTES };
    assert_eq!(cache.refresh(&session), Err(expected.clone()));
    assert_eq!(evaluations.load(Ordering::SeqCst), 2);
    let current = cache.current().ok_or_else(|| test_error("cache lost retained observation"))?;
    assert_eq!(current.id(), retained.id());
    assert!(Arc::ptr_eq(current.shared_batch(), retained.shared_batch()));
    assert_eq!(current.batch().base_state().snapshot().revision(), Revision::ZERO);

    assert_eq!(cache.refresh(&session), Err(expected));
    assert_eq!(evaluations.load(Ordering::SeqCst), 3);
    let current = cache.current().ok_or_else(|| test_error("cache lost retained observation"))?;
    assert_eq!(current.id(), retained.id());
    assert!(Arc::ptr_eq(current.shared_batch(), retained.shared_batch()));
    Ok(())
}

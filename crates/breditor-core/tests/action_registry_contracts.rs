//! Black-box contracts for deterministic extensible action registration and preparation.

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
        ActionEvaluation, ActionExecutionError, ActionFault, ActionId, ActionInput,
        ActionInputContract, ActionInputError, ActionInputVersion, ActionInputVersionError,
        ActionInvocation, ActionPlan, ActionPreparation, ActionPrepareError, ActionRegistration,
        ActionRegistry, ActionRegistryError, ActionStateContract, ActionStateDomains,
        ActionStateIndicator, ActionStateSpec, ActionStateValidationError, ActionStateValue,
        ActionValue, ActionValueError, Capability, DecodeActionInput, DisabledReason,
        InvalidActionPlan, MAX_ACTION_VALUE_CONTAINER_ENTRIES, MAX_ACTION_VALUE_COUNT,
        MAX_ACTION_VALUE_DEPTH, MAX_ACTION_VALUE_OBJECT_KEY_BYTES, MAX_ACTION_VALUE_TEXT_BYTES,
        PreparedActionExecutionError, TypedActionInput,
    },
    codec::DocumentJsonCodec,
    document::{FormatSet, TextFragment, TextRun},
    identity::QualifiedName,
    operation::{Operation, SelectionRelocationPolicy, TextRange, TextSplice},
    position::{NodePath, TextOffset},
    state::{EditorContext, EditorState, LineageId},
    transaction::{HistoryIntent, PendingFormatsUpdate, SelectionUpdate},
};
use support::{document_json, paragraph, test_error, text_node};

type TestResult = Result<(), Box<dyn Error>>;

fn action_id(value: &str) -> Result<ActionId, Box<dyn Error>> {
    ActionId::try_new(value).map_err(Into::into)
}

fn name(value: &str) -> Result<QualifiedName, Box<dyn Error>> {
    QualifiedName::try_new(value).map_err(Into::into)
}

fn input_contract(value: &str, version: u32) -> Result<ActionInputContract, Box<dyn Error>> {
    Ok(ActionInputContract::new(name(value)?, ActionInputVersion::try_new(version)?))
}

fn state(lineage: &str, text: &str) -> Result<EditorState, Box<dyn Error>> {
    let context = EditorContext::default();
    let children = if text.is_empty() { Vec::new() } else { vec![text_node(text, false)] };
    let encoded = document_json(&[paragraph(&children)]);
    let document = DocumentJsonCodec::new(context.schema().clone())
        .with_limits(context.limits().clone())
        .decode(&encoded)?;
    EditorState::try_new(&context, LineageId::try_new(lineage)?, document, None, None)
        .map_err(Into::into)
}

fn plan(operations: Vec<Operation>, history: HistoryIntent) -> ActionPlan {
    ActionPlan::new(
        operations,
        SelectionRelocationPolicy::default(),
        SelectionUpdate::Relocate,
        PendingFormatsUpdate::Preserve,
        history,
    )
}

fn text_fragment(text: &str) -> Result<TextFragment, Box<dyn Error>> {
    if text.is_empty() {
        Ok(TextFragment::empty())
    } else {
        TextRun::try_new(text, FormatSet::default()).map(TextFragment::from).map_err(Into::into)
    }
}

fn range(start: u64, end: u64) -> Result<TextRange, Box<dyn Error>> {
    TextRange::try_new(
        NodePath::try_from_indices(vec![0])?,
        TextOffset::try_new(start)?,
        TextOffset::try_new(end)?,
    )
    .map_err(Into::into)
}

#[derive(Clone)]
struct InsertAction {
    evaluations: Arc<AtomicUsize>,
    fault: ActionFault,
}

impl Action for InsertAction {
    type Input = ();

    fn evaluate(
        &self,
        state: &EditorState,
        (): &Self::Input,
    ) -> Result<ActionEvaluation, ActionFault> {
        self.evaluations.fetch_add(1, Ordering::SeqCst);
        let range = range(0, 0).map_err(|_| self.fault.clone())?;
        let replacement = text_fragment("x").map_err(|_| self.fault.clone())?;
        let operation = TextSplice::capture(state.context(), state.document(), range, replacement)
            .map_err(|_| self.fault.clone())?;
        Ok(ActionEvaluation::stateless(ActionDecision::Enabled(plan(
            vec![operation.into()],
            HistoryIntent::Record,
        ))))
    }
}

#[derive(Clone)]
struct DisabledAction {
    reason: DisabledReason,
}

impl Action for DisabledAction {
    type Input = ();

    fn evaluate(&self, _: &EditorState, (): &Self::Input) -> Result<ActionEvaluation, ActionFault> {
        Ok(ActionEvaluation::stateless(ActionDecision::Disabled(self.reason.clone())))
    }
}

#[derive(Clone)]
struct FaultAction {
    fault: ActionFault,
}

impl Action for FaultAction {
    type Input = ();

    fn evaluate(&self, _: &EditorState, (): &Self::Input) -> Result<ActionEvaluation, ActionFault> {
        Err(self.fault.clone())
    }
}

#[derive(Clone)]
struct NoOpAction;

impl Action for NoOpAction {
    type Input = ();

    fn evaluate(&self, _: &EditorState, (): &Self::Input) -> Result<ActionEvaluation, ActionFault> {
        Ok(ActionEvaluation::stateless(ActionDecision::Enabled(plan(
            Vec::new(),
            HistoryIntent::Record,
        ))))
    }
}

#[derive(Clone)]
struct InvalidIndicatorAction {
    reason: DisabledReason,
}

impl Action for InvalidIndicatorAction {
    type Input = ();

    fn evaluate(&self, _: &EditorState, (): &Self::Input) -> Result<ActionEvaluation, ActionFault> {
        Ok(ActionEvaluation::new(
            ActionDecision::Disabled(self.reason.clone()),
            ActionStateIndicator::new(ActionActivation::Active, ActionStateValue::Unsupported),
        ))
    }
}

#[derive(Clone)]
struct DeclaredTrackedAction {
    reason: DisabledReason,
}

impl Action for DeclaredTrackedAction {
    type Input = ();

    fn state_spec() -> ActionStateSpec {
        ActionStateSpec::new(
            ActionStateContract::new(ActionActivationContract::Tracked, None),
            ActionEffects::new(ActionStateDomains::DOCUMENT, ActionStateDomains::NONE),
        )
    }

    fn evaluate(&self, _: &EditorState, (): &Self::Input) -> Result<ActionEvaluation, ActionFault> {
        Ok(ActionEvaluation::new(
            ActionDecision::Disabled(self.reason.clone()),
            ActionStateIndicator::new(ActionActivation::Active, ActionStateValue::Unsupported),
        ))
    }
}

#[derive(Clone)]
struct InvalidPlanAction {
    fault: ActionFault,
    expected_removed: &'static str,
}

impl Action for InvalidPlanAction {
    type Input = ();

    fn evaluate(&self, _: &EditorState, (): &Self::Input) -> Result<ActionEvaluation, ActionFault> {
        let end = u64::try_from(self.expected_removed.encode_utf16().count())
            .map_err(|_| self.fault.clone())?;
        let operation = TextSplice::try_new(
            range(0, end).map_err(|_| self.fault.clone())?,
            text_fragment(self.expected_removed).map_err(|_| self.fault.clone())?,
            text_fragment("x").map_err(|_| self.fault.clone())?,
        )
        .map_err(|_| self.fault.clone())?;
        Ok(ActionEvaluation::stateless(ActionDecision::Enabled(plan(
            vec![operation.into()],
            HistoryIntent::Record,
        ))))
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
struct BooleanAction {
    reason: DisabledReason,
}

impl Action for BooleanAction {
    type Input = BooleanInput;

    fn evaluate(
        &self,
        _: &EditorState,
        input: &Self::Input,
    ) -> Result<ActionEvaluation, ActionFault> {
        let detail = ActionValue::boolean(input.0);
        Ok(ActionEvaluation::stateless(ActionDecision::Disabled(DisabledReason::new(
            self.reason.code().clone(),
            Some(detail),
        ))))
    }
}

fn insert_registration(
    id: ActionId,
    evaluations: Arc<AtomicUsize>,
) -> Result<ActionRegistration, Box<dyn Error>> {
    let fault = ActionFault::new(name("test/insert-fault")?, None);
    Ok(ActionRegistration::without_input(id, InsertAction { evaluations, fault }))
}

#[test]
fn duplicate_rejection_is_independent_of_registration_order() -> TestResult {
    let id = action_id("test/duplicate")?;
    let left = ActionRegistration::without_input(id.clone(), NoOpAction);
    let right = ActionRegistration::without_input(id.clone(), NoOpAction);
    let forward = ActionRegistry::try_new(vec![left, right]);

    let left = ActionRegistration::without_input(id.clone(), NoOpAction);
    let right = ActionRegistration::without_input(id.clone(), NoOpAction);
    let reverse = ActionRegistry::try_new(vec![right, left]);
    assert_eq!(forward.err(), Some(ActionRegistryError::DuplicateActionId { id: id.clone() }));
    assert_eq!(reverse.err(), Some(ActionRegistryError::DuplicateActionId { id }));

    let first = action_id("test/a-duplicate")?;
    let last = action_id("test/z-duplicate")?;
    for registrations in [
        vec![last.clone(), first.clone(), last.clone(), first.clone()],
        vec![first.clone(), last.clone(), first.clone(), last],
    ] {
        let registrations = registrations
            .into_iter()
            .map(|id| ActionRegistration::without_input(id, NoOpAction))
            .collect();
        assert_eq!(
            ActionRegistry::try_new(registrations).err(),
            Some(ActionRegistryError::DuplicateActionId { id: first.clone() })
        );
    }
    Ok(())
}

#[test]
fn history_read_rejection_is_lexical_and_follows_duplicate_validation() -> TestResult {
    let first = action_id("test/a-history-reader")?;
    let last = action_id("test/z-history-reader")?;
    let effects =
        ActionEffects::new(ActionStateDomains::HISTORY, ActionEffects::conservative().may_write());
    for ids in [vec![last.clone(), first.clone()], vec![first.clone(), last.clone()]] {
        let registrations = ids
            .into_iter()
            .map(|id| {
                ActionRegistration::without_input(id, NoOpAction).with_state_spec(
                    ActionStateSpec::new(ActionStateContract::stateless(), effects),
                )
            })
            .collect();
        assert_eq!(
            ActionRegistry::try_new(registrations).err(),
            Some(ActionRegistryError::UnsupportedHistoryRead { id: first.clone() })
        );
    }

    let duplicate = action_id("test/z-duplicate-history-phase")?;
    let invalid = ActionRegistration::without_input(first, NoOpAction)
        .with_state_spec(ActionStateSpec::new(ActionStateContract::stateless(), effects));
    assert_eq!(
        ActionRegistry::try_new(vec![
            ActionRegistration::without_input(duplicate.clone(), NoOpAction),
            invalid,
            ActionRegistration::without_input(duplicate.clone(), NoOpAction),
        ])
        .err(),
        Some(ActionRegistryError::DuplicateActionId { id: duplicate })
    );
    Ok(())
}

#[test]
fn descriptors_are_lexical_and_expose_input_contracts() -> TestResult {
    let contract = input_contract("test/boolean-input", 3)?;
    let reason = DisabledReason::new(name("test/disabled")?, None);
    let registry = ActionRegistry::try_new(vec![
        ActionRegistration::with_input(
            action_id("test/z-last")?,
            contract.clone(),
            BooleanAction { reason },
        ),
        ActionRegistration::without_input(action_id("test/a-first")?, NoOpAction),
    ])?;
    let descriptors = registry.descriptors().collect::<Vec<_>>();
    assert_eq!(descriptors.len(), 2);
    assert_eq!(descriptors[0].id(), &action_id("test/a-first")?);
    assert_eq!(descriptors[0].input_contract(), None);
    assert_eq!(descriptors[1].id(), &action_id("test/z-last")?);
    assert_eq!(descriptors[1].input_contract(), Some(&contract));
    Ok(())
}

#[test]
fn registration_captures_the_handler_state_spec_before_an_explicit_override() -> TestResult {
    let declared_id = action_id("test/a-declared-state")?;
    let overridden_id = action_id("test/z-overridden-state")?;
    let reason = DisabledReason::new(name("test/disabled")?, None);
    let registry = ActionRegistry::try_new(vec![
        ActionRegistration::without_input(
            declared_id.clone(),
            DeclaredTrackedAction { reason: reason.clone() },
        ),
        ActionRegistration::without_input(overridden_id.clone(), DeclaredTrackedAction { reason })
            .with_state_spec(ActionStateSpec::stateless()),
    ])?;

    let declared = registry
        .descriptor(&declared_id)
        .ok_or_else(|| test_error("declared-state descriptor was missing"))?;
    assert_eq!(declared.state_spec(), &DeclaredTrackedAction::state_spec());
    let overridden = registry
        .descriptor(&overridden_id)
        .ok_or_else(|| test_error("overridden-state descriptor was missing"))?;
    assert_eq!(overridden.state_spec(), &ActionStateSpec::stateless());

    let state = state("action-declared-state", "a")?;
    let declared = registry.prepare(&state, &ActionInvocation::without_input(declared_id))?;
    assert_eq!(declared.indicator().activation(), ActionActivation::Active);
    assert!(matches!(
        registry.prepare(&state, &ActionInvocation::without_input(overridden_id)),
        Err(ActionPrepareError::InvalidState {
            source: ActionStateValidationError::UnexpectedActivation {
                actual: ActionActivation::Active,
            },
            ..
        })
    ));
    Ok(())
}

#[test]
fn action_input_versions_reserve_zero() {
    assert_eq!(ActionInputVersion::try_new(0), Err(ActionInputVersionError::Zero));
    assert_eq!(ActionInputVersion::one().get(), 1);
}

#[test]
fn action_input_and_invocation_debug_redact_typed_payloads() -> TestResult {
    let secret = "secret-action-invocation-payload";
    let input = ActionInput::typed(
        input_contract("test/debug-input", 7)?,
        ActionValue::try_from_string(secret)?,
    );
    let invocation = ActionInvocation::new(action_id("test/debug-action")?, input.clone());

    let debug = format!("{input:?}\n{invocation:?}");
    assert!(!debug.contains(secret));
    assert!(debug.contains("test/debug-input"));
    assert!(debug.contains("test/debug-action"));
    assert!(debug.contains("String"));
    assert!(debug.contains("<redacted>"));
    Ok(())
}

#[test]
fn typed_contract_mismatch_and_unknown_identity_are_distinct() -> TestResult {
    let state = state("action-input-errors", "a")?;
    let id = action_id("test/typed")?;
    let expected = input_contract("test/boolean-input", 1)?;
    let actual = input_contract("test/other-input", 1)?;
    let reason = DisabledReason::new(name("test/disabled")?, None);
    let registry = ActionRegistry::try_new(vec![ActionRegistration::with_input(
        id.clone(),
        expected.clone(),
        BooleanAction { reason },
    )])?;
    let mismatch = registry.prepare(
        &state,
        &ActionInvocation::new(
            id.clone(),
            ActionInput::typed(actual.clone(), ActionValue::boolean(true)),
        ),
    );
    assert_eq!(
        mismatch.err(),
        Some(ActionPrepareError::InvalidInput {
            id,
            source: ActionInputError::ContractMismatch { expected, actual },
        })
    );

    let missing = action_id("test/missing")?;
    assert_eq!(
        registry.prepare(&state, &ActionInvocation::without_input(missing.clone())).err(),
        Some(ActionPrepareError::UnknownAction { id: missing })
    );
    Ok(())
}

#[test]
fn disabled_reason_is_identical_for_capability_and_execution() -> TestResult {
    let state = state("action-disabled", "a")?;
    let id = action_id("test/disabled-action")?;
    let detail = ActionValue::try_from_string("at-boundary")?;
    let reason = DisabledReason::new(name("test/not-applicable")?, Some(detail));
    let registry = ActionRegistry::try_new(vec![ActionRegistration::without_input(
        id.clone(),
        DisabledAction { reason: reason.clone() },
    )])?;
    let preparation = registry.prepare(&state, &ActionInvocation::without_input(id))?;
    assert_eq!(preparation.capability(), Capability::Disabled(reason.clone()));
    assert_eq!(preparation.indicator(), &ActionStateIndicator::stateless());
    assert_eq!(preparation.actual_writes(), None);
    assert!(!format!("{preparation:?}").contains("at-boundary"));
    assert_eq!(preparation.execute(&state), Err(ActionExecutionError::Disabled { reason }));
    Ok(())
}

#[test]
fn disabled_preparations_are_bound_to_their_exact_base_state() -> TestResult {
    let state = state("action-disabled-stale", "a")?;
    let disabled_id = action_id("test/disabled-action")?;
    let insert_id = action_id("test/insert")?;
    let reason = DisabledReason::new(name("test/not-applicable")?, None);
    let registry = ActionRegistry::try_new(vec![
        ActionRegistration::without_input(disabled_id.clone(), DisabledAction { reason }),
        insert_registration(insert_id.clone(), Arc::new(AtomicUsize::new(0)))?,
    ])?;
    let disabled = registry.prepare(&state, &ActionInvocation::without_input(disabled_id))?;
    let advanced =
        registry.prepare(&state, &ActionInvocation::without_input(insert_id))?.execute(&state)?;
    assert!(matches!(
        disabled.execute(advanced.after()),
        Err(ActionExecutionError::Prepared(PreparedActionExecutionError::StaleSnapshot { .. }))
    ));
    Ok(())
}

#[test]
fn faults_failed_transactions_and_enabled_no_ops_are_invalid_preparations() -> TestResult {
    let state = state("action-invalid-plans", "a")?;
    let fault = ActionFault::new(name("test/handler-fault")?, None);
    let fault_id = action_id("test/fault")?;
    let invalid_id = action_id("test/invalid")?;
    let no_op_id = action_id("test/no-op")?;
    let registry = ActionRegistry::try_new(vec![
        ActionRegistration::without_input(fault_id.clone(), FaultAction { fault: fault.clone() }),
        ActionRegistration::without_input(
            invalid_id.clone(),
            InvalidPlanAction { fault: fault.clone(), expected_removed: "z" },
        ),
        ActionRegistration::without_input(no_op_id.clone(), NoOpAction),
    ])?;

    assert_eq!(
        registry.prepare(&state, &ActionInvocation::without_input(fault_id.clone())).err(),
        Some(ActionPrepareError::Fault { id: fault_id, source: fault })
    );
    assert!(matches!(
        registry
            .prepare(&state, &ActionInvocation::without_input(invalid_id.clone())),
        Err(ActionPrepareError::InvalidPlan {
            id,
            source: InvalidActionPlan::Transaction { .. },
        }) if id == invalid_id
    ));
    assert_eq!(
        registry.prepare(&state, &ActionInvocation::without_input(no_op_id.clone())).err(),
        Some(ActionPrepareError::InvalidPlan {
            id: no_op_id,
            source: InvalidActionPlan::Unchanged,
        })
    );
    Ok(())
}

#[test]
fn preparation_error_debug_redacts_handler_and_transaction_payloads() -> TestResult {
    let document_secret = "direct-secret";
    let expected_secret = "wrong-content";
    let fault_secret = "secret-handler-fault-detail";
    let state = state("action-error-debug-redaction", document_secret)?;
    let fault_id = action_id("test/debug-fault-action")?;
    let invalid_id = action_id("test/debug-invalid-plan")?;
    let handler_fault = ActionFault::new(
        name("test/debug-handler-fault")?,
        Some(ActionValue::try_from_string(fault_secret)?),
    );
    let planning_fault = ActionFault::new(name("test/debug-planning-fault")?, None);
    let registry = ActionRegistry::try_new(vec![
        ActionRegistration::without_input(fault_id.clone(), FaultAction { fault: handler_fault }),
        ActionRegistration::without_input(
            invalid_id.clone(),
            InvalidPlanAction { fault: planning_fault, expected_removed: expected_secret },
        ),
    ])?;

    let Err(fault_error) = registry.prepare(&state, &ActionInvocation::without_input(fault_id))
    else {
        return Err(test_error("faulting action unexpectedly prepared").into());
    };
    let fault_debug = format!("{fault_error:?}");
    assert!(!fault_debug.contains(fault_secret));
    assert!(fault_debug.contains("test/debug-handler-fault"));

    let Err(plan_error) = registry.prepare(&state, &ActionInvocation::without_input(invalid_id))
    else {
        return Err(test_error("mismatched action plan unexpectedly prepared").into());
    };
    let plan_debug = format!("{plan_error:?}");
    assert!(!plan_debug.contains(document_secret));
    assert!(!plan_debug.contains(expected_secret));
    assert!(plan_debug.contains("operation"));
    Ok(())
}

#[test]
fn indicator_shape_is_validated_before_capability_is_published() -> TestResult {
    let state = state("action-invalid-indicator", "a")?;
    let id = action_id("test/invalid-indicator")?;
    let reason = DisabledReason::new(name("test/disabled")?, None);
    let registry = ActionRegistry::try_new(vec![ActionRegistration::without_input(
        id.clone(),
        InvalidIndicatorAction { reason },
    )])?;

    assert_eq!(
        registry.prepare(&state, &ActionInvocation::without_input(id.clone())).err(),
        Some(ActionPrepareError::InvalidState {
            id,
            source: ActionStateValidationError::UnexpectedActivation {
                actual: ActionActivation::Active,
            },
        })
    );
    Ok(())
}

#[test]
fn disabled_but_active_indicator_survives_authoritative_preparation() -> TestResult {
    let state = state("action-disabled-active", "a")?;
    let id = action_id("test/disabled-active")?;
    let reason = DisabledReason::new(name("test/disabled")?, None);
    let spec = ActionStateSpec::new(
        ActionStateContract::new(ActionActivationContract::Tracked, None),
        ActionEffects::conservative(),
    );
    let registration = ActionRegistration::without_input(
        id.clone(),
        InvalidIndicatorAction { reason: reason.clone() },
    )
    .with_state_spec(spec);
    let registry = ActionRegistry::try_new(vec![registration])?;

    let preparation = registry.prepare(&state, &ActionInvocation::without_input(id))?;
    assert_eq!(preparation.capability(), Capability::Disabled(reason));
    assert_eq!(preparation.indicator().activation(), ActionActivation::Active);
    assert_eq!(preparation.actual_writes(), None);
    Ok(())
}

#[test]
fn successful_preflight_rejects_writes_outside_declared_effects() -> TestResult {
    let state = state("action-undeclared-writes", "a")?;
    let id = action_id("test/undeclared-write")?;
    let registration = insert_registration(id.clone(), Arc::new(AtomicUsize::new(0)))?
        .with_state_spec(ActionStateSpec::new(
            ActionStateContract::stateless(),
            ActionEffects::new(ActionEffects::conservative().reads(), ActionStateDomains::HISTORY),
        ));
    let registry = ActionRegistry::try_new(vec![registration])?;

    assert_eq!(
        registry.prepare(&state, &ActionInvocation::without_input(id.clone())).err(),
        Some(ActionPrepareError::InvalidPlan {
            id,
            source: InvalidActionPlan::UndeclaredWrites {
                declared: ActionStateDomains::HISTORY,
                actual: ActionStateDomains::DOCUMENT
                    .union(ActionStateDomains::HISTORY)
                    .union(ActionStateDomains::SNAPSHOT),
            },
        })
    );
    Ok(())
}

#[test]
fn one_evaluation_stamps_metadata_and_execution_returns_the_cached_commit() -> TestResult {
    let secret = "secret-preparation-document";
    let state = state("action-one-evaluation", secret)?;
    let id = action_id("test/insert")?;
    let evaluations = Arc::new(AtomicUsize::new(0));
    let registry =
        ActionRegistry::try_new(vec![insert_registration(id.clone(), Arc::clone(&evaluations))?])?;
    let preparation = registry.prepare(&state, &ActionInvocation::without_input(id.clone()))?;
    assert_eq!(preparation.capability(), Capability::Enabled);
    let ActionPreparation::Enabled(prepared) = preparation else {
        return Err(Box::new(test_error("enabled insertion was disabled")));
    };
    assert_eq!(prepared.indicator(), &ActionStateIndicator::stateless());
    assert_eq!(
        prepared.actual_writes(),
        ActionStateDomains::DOCUMENT
            .union(ActionStateDomains::HISTORY)
            .union(ActionStateDomains::SNAPSHOT)
    );
    assert!(!format!("{prepared:?}").contains(secret));
    assert_eq!(prepared.transaction().metadata().action(), Some(id.qualified_name()));
    assert_eq!(evaluations.load(Ordering::SeqCst), 1);
    let commit = prepared.execute(&state)?;
    assert_eq!(commit.metadata().action(), Some(id.qualified_name()));
    assert_eq!(commit.before(), &state);
    assert_eq!(evaluations.load(Ordering::SeqCst), 1);
    Ok(())
}

#[test]
fn cached_execution_rejects_stale_and_reused_snapshot_states() -> TestResult {
    let initial_state = state("action-stale", "a")?;
    let id = action_id("test/insert")?;
    let registry = ActionRegistry::try_new(vec![insert_registration(
        id.clone(),
        Arc::new(AtomicUsize::new(0)),
    )?])?;
    let first = registry.prepare(&initial_state, &ActionInvocation::without_input(id.clone()))?;
    let second = registry.prepare(&initial_state, &ActionInvocation::without_input(id))?;
    let advanced = second.execute(&initial_state)?;
    assert!(matches!(
        first.execute(advanced.after()),
        Err(ActionExecutionError::Prepared(PreparedActionExecutionError::StaleSnapshot { .. }))
    ));

    let prepared = registry
        .prepare(&initial_state, &ActionInvocation::without_input(action_id("test/insert")?))?;
    let reused = state("action-stale", "different")?;
    assert_eq!(initial_state.snapshot(), reused.snapshot());
    assert!(matches!(
        prepared.execute(&reused),
        Err(ActionExecutionError::Prepared(PreparedActionExecutionError::BaseStateMismatch { .. }))
    ));
    Ok(())
}

#[test]
fn action_values_sort_keys_reject_duplicates_and_enforce_fixed_text_budget() -> TestResult {
    let object = ActionValue::try_object(vec![
        ("z".to_owned(), ActionValue::boolean(true)),
        ("a_key".to_owned(), ActionValue::null()),
    ])?;
    let keys = object
        .as_object()
        .ok_or_else(|| test_error("object constructor returned a non-object"))?
        .iter()
        .map(|(key, _)| key)
        .collect::<Vec<_>>();
    assert_eq!(keys, vec!["a_key", "z"]);
    assert_eq!(object.summary().value_count(), 3);
    assert_eq!(object.summary().max_depth(), 1);
    assert_eq!(
        ActionValue::try_object(vec![
            ("same".to_owned(), ActionValue::null()),
            ("same".to_owned(), ActionValue::boolean(false)),
        ]),
        Err(ActionValueError::DuplicateObjectKey { key: "same".to_owned() })
    );

    let oversized_length = usize::try_from(MAX_ACTION_VALUE_TEXT_BYTES)?.saturating_add(1);
    assert_eq!(
        ActionValue::try_from_string("x".repeat(oversized_length)),
        Err(ActionValueError::TextBytes {
            actual: MAX_ACTION_VALUE_TEXT_BYTES + 1,
            maximum: MAX_ACTION_VALUE_TEXT_BYTES,
        })
    );
    Ok(())
}

#[test]
fn action_value_depth_count_container_and_ascii_key_limits_are_exact() -> TestResult {
    let mut nested = ActionValue::null();
    for _ in 0..MAX_ACTION_VALUE_DEPTH {
        nested = ActionValue::try_array(vec![nested])?;
    }
    assert_eq!(nested.summary().max_depth(), MAX_ACTION_VALUE_DEPTH);
    assert_eq!(
        ActionValue::try_array(vec![nested]),
        Err(ActionValueError::Depth {
            actual: MAX_ACTION_VALUE_DEPTH + 1,
            maximum: MAX_ACTION_VALUE_DEPTH,
        })
    );

    let exact_container = vec![ActionValue::null(); MAX_ACTION_VALUE_CONTAINER_ENTRIES];
    assert_eq!(
        ActionValue::try_array(exact_container)?.summary().value_count(),
        u32::try_from(MAX_ACTION_VALUE_CONTAINER_ENTRIES)? + 1
    );
    assert_eq!(
        ActionValue::try_array(vec![ActionValue::null(); MAX_ACTION_VALUE_CONTAINER_ENTRIES + 1]),
        Err(ActionValueError::ContainerEntries {
            actual: MAX_ACTION_VALUE_CONTAINER_ENTRIES + 1,
            maximum: MAX_ACTION_VALUE_CONTAINER_ENTRIES,
        })
    );

    let three = ActionValue::try_array(vec![
        ActionValue::null(),
        ActionValue::null(),
        ActionValue::null(),
    ])?;
    let two = ActionValue::try_array(vec![ActionValue::null(), ActionValue::null()])?;
    let mut exact_count = vec![three.clone(); MAX_ACTION_VALUE_CONTAINER_ENTRIES - 1];
    exact_count.push(two);
    assert_eq!(
        ActionValue::try_array(exact_count)?.summary().value_count(),
        MAX_ACTION_VALUE_COUNT
    );
    assert_eq!(
        ActionValue::try_array(vec![three; MAX_ACTION_VALUE_CONTAINER_ENTRIES]),
        Err(ActionValueError::ValueCount {
            actual: MAX_ACTION_VALUE_COUNT + 1,
            maximum: MAX_ACTION_VALUE_COUNT,
        })
    );

    let maximum_key = format!("a{}", "x".repeat(MAX_ACTION_VALUE_OBJECT_KEY_BYTES - 1));
    assert!(ActionValue::try_object(vec![(maximum_key, ActionValue::null())]).is_ok());
    let oversized_key = format!("a{}", "x".repeat(MAX_ACTION_VALUE_OBJECT_KEY_BYTES));
    assert_eq!(
        ActionValue::try_object(vec![(oversized_key, ActionValue::null())]),
        Err(ActionValueError::ObjectKeyTooLong {
            actual: MAX_ACTION_VALUE_OBJECT_KEY_BYTES + 1,
            maximum: MAX_ACTION_VALUE_OBJECT_KEY_BYTES,
        })
    );
    assert!(matches!(
        ActionValue::try_object(vec![("é".to_owned(), ActionValue::null())]),
        Err(ActionValueError::InvalidObjectKeyStart { .. })
    ));
    assert!(matches!(
        ActionValue::try_object(vec![("a😀".to_owned(), ActionValue::null())]),
        Err(ActionValueError::InvalidObjectKeyCharacter { .. })
    ));
    Ok(())
}

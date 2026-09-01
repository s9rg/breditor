//! Black-box contracts for deterministic semantic-intent routing.

mod support;

use std::{
    error::Error,
    sync::{
        Arc, Mutex,
        atomic::{AtomicUsize, Ordering},
    },
};

use breditor_core::{
    action::{
        Action, ActionActivationContract, ActionDecision, ActionEffects, ActionEvaluation,
        ActionFault, ActionId, ActionInput, ActionInputContract, ActionInputError,
        ActionInputVersion, ActionInvocation, ActionPlan, ActionPrepareError, ActionRegistration,
        ActionRegistry, ActionStateContract, ActionStateDomains, ActionStateIndicator,
        ActionStateSpec, ActionValue, DecodeActionInput, DisabledReason, InvalidActionPlan,
        TypedActionInput,
        routing::{
            BindingId, BindingPriority, DisabledRouting, IntentBinding, IntentDeclaration,
            IntentExecutionOutcome, IntentFallThrough, IntentId, IntentInvocation,
            IntentRouteBaseError, IntentRouteError, IntentRouteOutcome, IntentRouter,
            IntentRouterError, MAX_BINDINGS_PER_INTENT, MAX_INTENT_BINDINGS,
            MAX_INTENT_DECLARATIONS,
        },
    },
    codec::DocumentJsonCodec,
    document::{FormatSet, TextFragment, TextRun},
    identity::QualifiedName,
    operation::{Operation, SelectionRelocationPolicy, TextRange, TextSplice},
    position::{NodePath, TextOffset},
    session::EditorSession,
    state::{EditorContext, EditorState, LineageId},
    transaction::{HistoryIntent, PendingFormatsUpdate, SelectionUpdate},
};
use support::{document_json, paragraph, test_error, text_node};

type TestResult = Result<(), Box<dyn Error>>;

fn action_id(value: &str) -> Result<ActionId, Box<dyn Error>> {
    ActionId::try_new(value).map_err(Into::into)
}

fn binding_id(value: &str) -> Result<BindingId, Box<dyn Error>> {
    BindingId::try_new(value).map_err(Into::into)
}

fn intent_id(value: &str) -> Result<IntentId, Box<dyn Error>> {
    IntentId::try_new(value).map_err(Into::into)
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

fn plan(operations: Vec<Operation>) -> ActionPlan {
    ActionPlan::new(
        operations,
        SelectionRelocationPolicy::default(),
        SelectionUpdate::Relocate,
        PendingFormatsUpdate::Preserve,
        HistoryIntent::Record,
    )
}

fn insertion(
    state: &EditorState,
    text: &str,
    fault: &ActionFault,
) -> Result<ActionPlan, ActionFault> {
    let range = TextRange::try_new(
        NodePath::try_from_indices(vec![0]).map_err(|_| fault.clone())?,
        TextOffset::try_new(0).map_err(|_| fault.clone())?,
        TextOffset::try_new(0).map_err(|_| fault.clone())?,
    )
    .map_err(|_| fault.clone())?;
    let run = TextRun::try_new(text, FormatSet::default()).map_err(|_| fault.clone())?;
    let operation =
        TextSplice::capture(state.context(), state.document(), range, TextFragment::from(run))
            .map_err(|_| fault.clone())?;
    Ok(plan(vec![operation.into()]))
}

#[derive(Clone)]
enum ProbeBehavior {
    Insert(&'static str),
    Disabled(DisabledReason),
    Fault(ActionFault),
    ExpectedRemovedMismatch(&'static str),
    InvalidNoOp,
}

#[derive(Clone)]
struct ProbeAction {
    evaluations: Arc<AtomicUsize>,
    behavior: ProbeBehavior,
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
            ProbeBehavior::Insert(text) => {
                insertion(state, text, &self.insertion_fault).map(ActionDecision::Enabled)
            }
            ProbeBehavior::Disabled(reason) => Ok(ActionDecision::Disabled(reason.clone())),
            ProbeBehavior::Fault(fault) => Err(fault.clone()),
            ProbeBehavior::ExpectedRemovedMismatch(expected_removed) => {
                let end = u64::try_from(expected_removed.encode_utf16().count())
                    .map_err(|_| self.insertion_fault.clone())?;
                let range = TextRange::try_new(
                    NodePath::try_from_indices(vec![0])
                        .map_err(|_| self.insertion_fault.clone())?,
                    TextOffset::ZERO,
                    TextOffset::try_new(end).map_err(|_| self.insertion_fault.clone())?,
                )
                .map_err(|_| self.insertion_fault.clone())?;
                let expected = TextRun::try_new(*expected_removed, FormatSet::default())
                    .map(TextFragment::from)
                    .map_err(|_| self.insertion_fault.clone())?;
                let replacement = TextRun::try_new("x", FormatSet::default())
                    .map(TextFragment::from)
                    .map_err(|_| self.insertion_fault.clone())?;
                let operation = TextSplice::try_new(range, expected, replacement)
                    .map_err(|_| self.insertion_fault.clone())?;
                Ok(ActionDecision::Enabled(plan(vec![operation.into()])))
            }
            ProbeBehavior::InvalidNoOp => Ok(ActionDecision::Enabled(plan(Vec::new()))),
        }?;
        Ok(ActionEvaluation::stateless(decision))
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

#[derive(Clone, Copy)]
struct FalseOnlyInput;

impl DecodeActionInput for FalseOnlyInput {
    fn decode(
        registered_contract: Option<&ActionInputContract>,
        input: &ActionInput,
    ) -> Result<Self, ActionInputError> {
        let decoded = BooleanInput::decode(registered_contract, input)?;
        if decoded.0 {
            let Some(contract) = registered_contract else {
                return Err(ActionInputError::MissingRegisteredContract);
            };
            return Err(ActionInputError::InvalidValue { code: contract.name().clone() });
        }
        Ok(Self)
    }
}

impl TypedActionInput for FalseOnlyInput {}

#[derive(Clone)]
struct TypedProbeAction {
    evaluations: Arc<AtomicUsize>,
    values: Arc<Mutex<Vec<bool>>>,
    reason_code: QualifiedName,
    lock_fault: ActionFault,
}

#[derive(Clone)]
struct FalseOnlyProbeAction {
    evaluations: Arc<AtomicUsize>,
    reason: DisabledReason,
}

impl Action for FalseOnlyProbeAction {
    type Input = FalseOnlyInput;

    fn evaluate(&self, _: &EditorState, _: &Self::Input) -> Result<ActionEvaluation, ActionFault> {
        self.evaluations.fetch_add(1, Ordering::SeqCst);
        Ok(ActionEvaluation::stateless(ActionDecision::Disabled(self.reason.clone())))
    }
}

impl Action for TypedProbeAction {
    type Input = BooleanInput;

    fn evaluate(
        &self,
        _: &EditorState,
        input: &Self::Input,
    ) -> Result<ActionEvaluation, ActionFault> {
        self.evaluations.fetch_add(1, Ordering::SeqCst);
        self.values.lock().map_err(|_| self.lock_fault.clone())?.push(input.0);
        Ok(ActionEvaluation::stateless(ActionDecision::Disabled(DisabledReason::new(
            self.reason_code.clone(),
            Some(ActionValue::boolean(input.0)),
        ))))
    }
}

fn probe_registration(
    id: ActionId,
    evaluations: Arc<AtomicUsize>,
    behavior: ProbeBehavior,
) -> Result<ActionRegistration, Box<dyn Error>> {
    let insertion_fault = ActionFault::new(name("test/insertion-fault")?, None);
    Ok(ActionRegistration::without_input(
        id,
        ProbeAction { evaluations, behavior, insertion_fault },
    ))
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

fn count(counter: &Arc<AtomicUsize>) -> usize {
    counter.load(Ordering::SeqCst)
}

#[test]
fn resource_limits_precede_duplicate_and_reference_validation() -> TestResult {
    let declaration = IntentDeclaration::new(intent_id("test/repeated-limit-intent")?);
    let declarations =
        vec![declaration; usize::try_from(MAX_INTENT_DECLARATIONS.saturating_add(1))?];
    assert_eq!(
        IntentRouter::try_new(ActionRegistry::default(), declarations, Vec::new()).err(),
        Some(IntentRouterError::TooManyIntentDeclarations {
            actual: MAX_INTENT_DECLARATIONS + 1,
            maximum: MAX_INTENT_DECLARATIONS,
        })
    );

    let prototype = IntentBinding::new(
        binding_id("test/repeated-limit-binding")?,
        intent_id("test/undeclared-limit-intent")?,
        action_id("test/unregistered-limit-action")?,
        BindingPriority::default(),
        DisabledRouting::FallThrough,
    );
    let bindings = vec![prototype; usize::try_from(MAX_INTENT_BINDINGS.saturating_add(1))?];
    assert_eq!(
        IntentRouter::try_new(ActionRegistry::default(), Vec::new(), bindings).err(),
        Some(IntentRouterError::TooManyIntentBindings {
            actual: MAX_INTENT_BINDINGS + 1,
            maximum: MAX_INTENT_BINDINGS,
        })
    );
    Ok(())
}

#[test]
fn per_intent_limit_reports_lexical_first_route_independent_of_order() -> TestResult {
    let first_intent = intent_id("test/a-over-limit")?;
    let last_intent = intent_id("test/z-over-limit")?;
    let count = usize::try_from(MAX_BINDINGS_PER_INTENT.saturating_add(1))?;
    let first_binding = IntentBinding::new(
        binding_id("test/repeated-first-per-intent-binding")?,
        first_intent.clone(),
        action_id("test/unregistered-per-intent-action")?,
        BindingPriority::default(),
        DisabledRouting::FallThrough,
    );
    let last_binding = IntentBinding::new(
        binding_id("test/repeated-last-per-intent-binding")?,
        last_intent,
        action_id("test/unregistered-per-intent-action")?,
        BindingPriority::default(),
        DisabledRouting::FallThrough,
    );
    let mut bindings = Vec::with_capacity(count.saturating_mul(2));
    for _ in 0..count {
        bindings.push(last_binding.clone());
    }
    for _ in 0..count {
        bindings.push(first_binding.clone());
    }
    let reverse = bindings.iter().cloned().rev().collect();
    let expected = IntentRouterError::TooManyBindingsForIntent {
        intent: first_intent,
        actual: MAX_BINDINGS_PER_INTENT + 1,
        maximum: MAX_BINDINGS_PER_INTENT,
    };
    assert_eq!(
        IntentRouter::try_new(ActionRegistry::default(), Vec::new(), bindings).err(),
        Some(expected.clone())
    );
    assert_eq!(
        IntentRouter::try_new(ActionRegistry::default(), Vec::new(), reverse).err(),
        Some(expected)
    );
    Ok(())
}

#[test]
fn router_accepts_all_three_resource_limits_at_the_exact_boundary() -> TestResult {
    let declarations = (0..MAX_INTENT_DECLARATIONS)
        .map(|index| {
            intent_id(&format!("test/limit-intent-{index:04}")).map(IntentDeclaration::new)
        })
        .collect::<Result<Vec<_>, _>>()?;
    let action_ids = (0..MAX_BINDINGS_PER_INTENT)
        .map(|index| action_id(&format!("test/limit-action-{index:04}")))
        .collect::<Result<Vec<_>, _>>()?;
    let reason = DisabledReason::new(name("test/limit-disabled")?, None);
    let registrations = action_ids
        .iter()
        .cloned()
        .map(|id| {
            probe_registration(
                id,
                Arc::new(AtomicUsize::new(0)),
                ProbeBehavior::Disabled(reason.clone()),
            )
        })
        .collect::<Result<Vec<_>, _>>()?;
    let registry = ActionRegistry::try_new(registrations)?;

    let routed_intent_count = MAX_INTENT_BINDINGS / MAX_BINDINGS_PER_INTENT;
    let mut bindings = Vec::with_capacity(usize::try_from(MAX_INTENT_BINDINGS)?);
    for (intent_index, declaration) in
        declarations.iter().take(usize::try_from(routed_intent_count)?).enumerate()
    {
        for (action_index, action) in action_ids.iter().enumerate() {
            bindings.push(IntentBinding::new(
                binding_id(&format!("test/limit-binding-{intent_index:04}-{action_index:04}"))?,
                declaration.id().clone(),
                action.clone(),
                BindingPriority::new(i32::try_from(action_index)?),
                DisabledRouting::FallThrough,
            ));
        }
    }

    let router = IntentRouter::try_new(registry, declarations, bindings)?;
    assert_eq!(router.intent_count(), usize::try_from(MAX_INTENT_DECLARATIONS)?);
    assert_eq!(router.binding_count(), usize::try_from(MAX_INTENT_BINDINGS)?);
    assert_eq!(
        router.bindings_for_intent(&intent_id("test/limit-intent-0000")?).map(<[_]>::len),
        Some(usize::try_from(MAX_BINDINGS_PER_INTENT)?)
    );
    let first_intent = intent_id("test/limit-intent-0000")?;
    let editor_state = state("router-limit-boundary", "a")?;
    let route =
        router.route(&editor_state, &IntentInvocation::without_input(first_intent.clone()))?;
    let IntentRouteOutcome::Unhandled(unhandled) = route else {
        return Err(test_error("maximum-depth all-fallthrough route was handled").into());
    };
    assert_eq!(unhandled.intent_id(), &first_intent);
    assert_eq!(unhandled.fallthroughs().len(), usize::try_from(MAX_BINDINGS_PER_INTENT)?);
    assert_eq!(
        unhandled.fallthroughs().first().map(IntentFallThrough::priority),
        Some(BindingPriority::new(i32::try_from(MAX_BINDINGS_PER_INTENT - 1)?))
    );
    assert_eq!(
        unhandled.fallthroughs().last().map(IntentFallThrough::priority),
        Some(BindingPriority::new(0))
    );
    Ok(())
}

#[test]
fn construction_conflicts_are_canonical_and_registration_order_independent() -> TestResult {
    let duplicate_intent = intent_id("test/duplicate-intent")?;
    let without_input = IntentDeclaration::new(duplicate_intent.clone());
    let with_input = IntentDeclaration::with_input(
        duplicate_intent.clone(),
        input_contract("test/duplicate-contract", 1)?,
    );
    let expected = IntentRouterError::DuplicateIntentId { id: duplicate_intent };
    for declarations in
        [vec![without_input.clone(), with_input.clone()], vec![with_input, without_input]]
    {
        assert_eq!(
            IntentRouter::try_new(ActionRegistry::default(), declarations, Vec::new()).err(),
            Some(expected.clone())
        );
    }

    let intent = intent_id("test/intent")?;
    let first_action = action_id("test/a-action")?;
    let last_action = action_id("test/z-action")?;
    let first_count = Arc::new(AtomicUsize::new(0));
    let last_count = Arc::new(AtomicUsize::new(0));
    let registry = ActionRegistry::try_new(vec![
        probe_registration(first_action.clone(), first_count, ProbeBehavior::InvalidNoOp)?,
        probe_registration(last_action.clone(), last_count, ProbeBehavior::InvalidNoOp)?,
    ])?;
    let duplicate_binding = binding_id("test/duplicate-binding")?;
    let first = IntentBinding::new(
        duplicate_binding.clone(),
        intent.clone(),
        first_action.clone(),
        BindingPriority::new(2),
        DisabledRouting::FallThrough,
    );
    let last = IntentBinding::new(
        duplicate_binding.clone(),
        intent.clone(),
        last_action.clone(),
        BindingPriority::new(1),
        DisabledRouting::Block,
    );
    for bindings in [vec![first.clone(), last.clone()], vec![last, first]] {
        assert_eq!(
            IntentRouter::try_new(
                registry.clone(),
                vec![IntentDeclaration::new(intent.clone())],
                bindings,
            )
            .err(),
            Some(IntentRouterError::DuplicateBindingId { id: duplicate_binding.clone() })
        );
    }
    Ok(())
}

#[test]
fn intent_history_read_rejection_is_lexical_and_follows_identity_validation() -> TestResult {
    let first = intent_id("test/a-history-reader")?;
    let last = intent_id("test/z-history-reader")?;
    let effects =
        ActionEffects::new(ActionStateDomains::HISTORY, ActionEffects::conservative().may_write());
    let declaration = |id| {
        IntentDeclaration::new(id)
            .with_state_spec(ActionStateSpec::new(ActionStateContract::stateless(), effects))
    };
    for declarations in [
        vec![declaration(last.clone()), declaration(first.clone())],
        vec![declaration(first.clone()), declaration(last.clone())],
    ] {
        assert_eq!(
            IntentRouter::try_new(ActionRegistry::default(), declarations, Vec::new()).err(),
            Some(IntentRouterError::UnsupportedHistoryRead { intent: first.clone() })
        );
    }

    let duplicate = intent_id("test/z-duplicate-history-phase")?;
    assert_eq!(
        IntentRouter::try_new(
            ActionRegistry::default(),
            vec![
                IntentDeclaration::new(duplicate.clone()),
                declaration(first),
                IntentDeclaration::new(duplicate.clone()),
            ],
            Vec::new(),
        )
        .err(),
        Some(IntentRouterError::DuplicateIntentId { id: duplicate })
    );
    Ok(())
}

#[test]
fn construction_rejects_unknown_references_and_contract_mismatch() -> TestResult {
    let intent = intent_id("test/intent")?;
    let missing_intent = intent_id("test/missing-intent")?;
    let action = action_id("test/action")?;
    let missing_action = action_id("test/missing-action")?;
    let first_binding = binding_id("test/a-binding")?;
    let registry = ActionRegistry::try_new(vec![probe_registration(
        action.clone(),
        Arc::new(AtomicUsize::new(0)),
        ProbeBehavior::InvalidNoOp,
    )?])?;

    let unknown_intent_binding = IntentBinding::new(
        first_binding.clone(),
        missing_intent.clone(),
        action.clone(),
        BindingPriority::new(0),
        DisabledRouting::FallThrough,
    );
    assert_eq!(
        IntentRouter::try_new(
            registry.clone(),
            vec![IntentDeclaration::new(intent.clone())],
            vec![unknown_intent_binding],
        )
        .err(),
        Some(IntentRouterError::UnknownIntent {
            binding: first_binding.clone(),
            intent: missing_intent,
        })
    );

    let unknown_action_binding = IntentBinding::new(
        first_binding.clone(),
        intent.clone(),
        missing_action.clone(),
        BindingPriority::new(0),
        DisabledRouting::FallThrough,
    );
    assert_eq!(
        IntentRouter::try_new(
            registry.clone(),
            vec![IntentDeclaration::new(intent.clone())],
            vec![unknown_action_binding],
        )
        .err(),
        Some(IntentRouterError::UnknownAction {
            binding: first_binding.clone(),
            action: missing_action,
        })
    );

    let expected = input_contract("test/typed-input", 1)?;
    assert_eq!(
        IntentRouter::try_new(
            registry,
            vec![IntentDeclaration::with_input(intent.clone(), expected.clone())],
            vec![IntentBinding::new(
                first_binding.clone(),
                intent.clone(),
                action.clone(),
                BindingPriority::new(0),
                DisabledRouting::Block,
            )],
        )
        .err(),
        Some(IntentRouterError::InputContractMismatch {
            intent,
            binding: first_binding,
            action,
            expected: Some(expected),
            actual: None,
        })
    );
    Ok(())
}

#[test]
fn construction_requires_exact_state_contracts_and_covering_intent_effects() -> TestResult {
    let intent = intent_id("test/state-intent")?;
    let action = action_id("test/state-action")?;
    let binding_id = binding_id("test/state-binding")?;
    let registry = ActionRegistry::try_new(vec![probe_registration(
        action.clone(),
        Arc::new(AtomicUsize::new(0)),
        ProbeBehavior::InvalidNoOp,
    )?])?;
    let binding = IntentBinding::new(
        binding_id.clone(),
        intent.clone(),
        action.clone(),
        BindingPriority::new(0),
        DisabledRouting::Block,
    );
    let tracked = ActionStateContract::new(ActionActivationContract::Tracked, None);

    assert_eq!(
        IntentRouter::try_new(
            registry.clone(),
            vec![IntentDeclaration::new(intent.clone()).with_state_spec(ActionStateSpec::new(
                tracked.clone(),
                ActionEffects::conservative(),
            ))],
            vec![binding.clone()],
        )
        .err(),
        Some(IntentRouterError::StateContractMismatch {
            intent: intent.clone(),
            binding: binding_id.clone(),
            action: action.clone(),
            expected: tracked,
            actual: ActionStateContract::stateless(),
        })
    );

    let narrow = ActionEffects::new(ActionStateDomains::NONE, ActionStateDomains::NONE);
    assert_eq!(
        IntentRouter::try_new(
            registry,
            vec![
                IntentDeclaration::new(intent.clone()).with_state_spec(ActionStateSpec::new(
                    ActionStateContract::stateless(),
                    narrow,
                ))
            ],
            vec![binding],
        )
        .err(),
        Some(IntentRouterError::EffectsNotCovered {
            intent,
            binding: binding_id,
            action,
            declared: narrow,
            required: ActionEffects::conservative(),
        })
    );
    Ok(())
}

#[test]
fn construction_rejects_duplicate_priorities_and_actions_canonically() -> TestResult {
    let intent = intent_id("test/intent")?;
    let action = action_id("test/action")?;
    let other_action = action_id("test/other-action")?;
    let first_binding = binding_id("test/a-binding")?;
    let last_binding = binding_id("test/z-binding")?;
    let registry = ActionRegistry::try_new(vec![
        probe_registration(
            action.clone(),
            Arc::new(AtomicUsize::new(0)),
            ProbeBehavior::InvalidNoOp,
        )?,
        probe_registration(
            other_action.clone(),
            Arc::new(AtomicUsize::new(0)),
            ProbeBehavior::InvalidNoOp,
        )?,
    ])?;

    let duplicate_priority = vec![
        IntentBinding::new(
            last_binding.clone(),
            intent.clone(),
            other_action.clone(),
            BindingPriority::new(-7),
            DisabledRouting::FallThrough,
        ),
        IntentBinding::new(
            first_binding.clone(),
            intent.clone(),
            action.clone(),
            BindingPriority::new(-7),
            DisabledRouting::Block,
        ),
    ];
    for bindings in [duplicate_priority.clone(), duplicate_priority.into_iter().rev().collect()] {
        assert_eq!(
            IntentRouter::try_new(
                registry.clone(),
                vec![IntentDeclaration::new(intent.clone())],
                bindings,
            )
            .err(),
            Some(IntentRouterError::DuplicatePriority {
                intent: intent.clone(),
                priority: BindingPriority::new(-7),
                bindings: [first_binding.clone(), last_binding.clone()],
            })
        );
    }

    let duplicate_action = vec![
        IntentBinding::new(
            last_binding.clone(),
            intent.clone(),
            action.clone(),
            BindingPriority::new(1),
            DisabledRouting::FallThrough,
        ),
        IntentBinding::new(
            first_binding.clone(),
            intent.clone(),
            action.clone(),
            BindingPriority::new(2),
            DisabledRouting::Block,
        ),
    ];
    for bindings in [duplicate_action.clone(), duplicate_action.into_iter().rev().collect()] {
        assert_eq!(
            IntentRouter::try_new(
                registry.clone(),
                vec![IntentDeclaration::new(intent.clone())],
                bindings,
            )
            .err(),
            Some(IntentRouterError::DuplicateAction {
                intent: intent.clone(),
                action: action.clone(),
                bindings: [first_binding.clone(), last_binding.clone()],
            })
        );
    }
    Ok(())
}

#[test]
fn descriptors_are_lexical_while_runtime_order_is_descending_signed_priority() -> TestResult {
    let first_intent = intent_id("test/a-intent")?;
    let last_intent = intent_id("test/z-intent")?;
    let first_action = action_id("test/a-action")?;
    let middle_action = action_id("test/m-action")?;
    let last_action = action_id("test/z-action")?;
    let registry = ActionRegistry::try_new(vec![
        probe_registration(
            last_action.clone(),
            Arc::new(AtomicUsize::new(0)),
            ProbeBehavior::InvalidNoOp,
        )?,
        probe_registration(
            first_action.clone(),
            Arc::new(AtomicUsize::new(0)),
            ProbeBehavior::InvalidNoOp,
        )?,
        probe_registration(
            middle_action.clone(),
            Arc::new(AtomicUsize::new(0)),
            ProbeBehavior::InvalidNoOp,
        )?,
    ])?;
    let first_binding = binding(
        "test/a-binding",
        &last_intent,
        &last_action,
        i32::MIN,
        DisabledRouting::FallThrough,
    )?;
    let middle_binding =
        binding("test/m-binding", &last_intent, &middle_action, 0, DisabledRouting::Block)?;
    let last_binding = binding(
        "test/z-binding",
        &last_intent,
        &first_action,
        i32::MAX,
        DisabledRouting::FallThrough,
    )?;
    let router = IntentRouter::try_new(
        registry,
        vec![
            IntentDeclaration::new(last_intent.clone()),
            IntentDeclaration::new(first_intent.clone()),
        ],
        vec![last_binding.clone(), first_binding.clone(), middle_binding.clone()],
    )?;

    assert_eq!(router.intent_count(), 2);
    assert_eq!(router.binding_count(), 3);
    assert!(!router.is_empty());
    assert_eq!(
        router.declarations().map(IntentDeclaration::id).collect::<Vec<_>>(),
        vec![&first_intent, &last_intent]
    );
    assert_eq!(
        router.bindings().map(IntentBinding::id).collect::<Vec<_>>(),
        vec![first_binding.id(), middle_binding.id(), last_binding.id()]
    );
    let runtime = router
        .bindings_for_intent(&last_intent)
        .ok_or_else(|| test_error("declared route is missing"))?;
    assert_eq!(runtime, &[last_binding, middle_binding, first_binding]);
    assert_eq!(router.bindings_for_intent(&first_intent), Some([].as_slice()));
    assert_eq!(router.bindings_for_intent(&intent_id("test/missing")?), None);
    Ok(())
}

#[test]
fn declared_empty_and_all_fallthrough_are_unhandled_but_unknown_is_an_error() -> TestResult {
    let empty_intent = intent_id("test/empty")?;
    let routed_intent = intent_id("test/routed")?;
    let unknown_intent = intent_id("test/unknown")?;
    let first_action = action_id("test/first-disabled")?;
    let last_action = action_id("test/last-disabled")?;
    let first_reason = DisabledReason::new(name("test/first-reason")?, None);
    let last_reason = DisabledReason::new(name("test/last-reason")?, None);
    let first_evaluations = Arc::new(AtomicUsize::new(0));
    let last_evaluations = Arc::new(AtomicUsize::new(0));
    let registry = ActionRegistry::try_new(vec![
        probe_registration(
            first_action.clone(),
            Arc::clone(&first_evaluations),
            ProbeBehavior::Disabled(first_reason.clone()),
        )?,
        probe_registration(
            last_action.clone(),
            Arc::clone(&last_evaluations),
            ProbeBehavior::Disabled(last_reason.clone()),
        )?,
    ])?;
    let first_binding = binding(
        "test/first-binding",
        &routed_intent,
        &first_action,
        10,
        DisabledRouting::FallThrough,
    )?;
    let last_binding = binding(
        "test/last-binding",
        &routed_intent,
        &last_action,
        -10,
        DisabledRouting::FallThrough,
    )?;
    let router = IntentRouter::try_new(
        registry,
        vec![
            IntentDeclaration::new(routed_intent.clone()),
            IntentDeclaration::new(empty_intent.clone()),
        ],
        vec![last_binding.clone(), first_binding.clone()],
    )?;
    let editor_state = state("router-unhandled", "a")?;

    let empty =
        router.route(&editor_state, &IntentInvocation::without_input(empty_intent.clone()))?;
    let IntentRouteOutcome::Unhandled(empty) = empty else {
        return Err(test_error("declared empty intent was not unhandled").into());
    };
    assert_eq!(empty.intent_id(), &empty_intent);
    assert_eq!(empty.base_state(), &editor_state);
    assert!(empty.fallthroughs().is_empty());
    assert_eq!(count(&first_evaluations), 0);
    assert_eq!(count(&last_evaluations), 0);

    let unhandled =
        router.route(&editor_state, &IntentInvocation::without_input(routed_intent.clone()))?;
    let IntentRouteOutcome::Unhandled(unhandled) = unhandled else {
        return Err(test_error("all-fallthrough intent was not unhandled").into());
    };
    assert_eq!(unhandled.intent_id(), &routed_intent);
    assert_eq!(unhandled.base_snapshot(), editor_state.snapshot());
    assert_eq!(unhandled.fallthroughs().len(), 2);
    assert_eq!(unhandled.fallthroughs()[0].binding_id(), first_binding.id());
    assert_eq!(unhandled.fallthroughs()[0].reason(), &first_reason);
    assert_eq!(unhandled.fallthroughs()[1].binding_id(), last_binding.id());
    assert_eq!(unhandled.fallthroughs()[1].reason(), &last_reason);
    assert_eq!(count(&first_evaluations), 1);
    assert_eq!(count(&last_evaluations), 1);

    assert_eq!(
        router
            .route(&editor_state, &IntentInvocation::without_input(unknown_intent.clone()),)
            .err(),
        Some(IntentRouteError::UnknownIntent { intent: unknown_intent })
    );
    assert_eq!(count(&first_evaluations), 1);
    assert_eq!(count(&last_evaluations), 1);
    Ok(())
}

#[test]
fn fallthrough_reaches_first_enabled_candidate_and_preserves_the_trace() -> TestResult {
    let intent = intent_id("test/fallback")?;
    let disabled_action = action_id("test/disabled")?;
    let enabled_action = action_id("test/enabled")?;
    let disabled_binding = binding_id("test/disabled-binding")?;
    let enabled_binding = binding_id("test/enabled-binding")?;
    let reason = DisabledReason::new(name("test/not-applicable")?, None);
    let disabled_evaluations = Arc::new(AtomicUsize::new(0));
    let enabled_evaluations = Arc::new(AtomicUsize::new(0));
    let registry = ActionRegistry::try_new(vec![
        probe_registration(
            disabled_action.clone(),
            Arc::clone(&disabled_evaluations),
            ProbeBehavior::Disabled(reason.clone()),
        )?,
        probe_registration(
            enabled_action.clone(),
            Arc::clone(&enabled_evaluations),
            ProbeBehavior::Insert("x"),
        )?,
    ])?;
    let router = IntentRouter::try_new(
        registry,
        vec![IntentDeclaration::new(intent.clone())],
        vec![
            IntentBinding::new(
                enabled_binding.clone(),
                intent.clone(),
                enabled_action.clone(),
                BindingPriority::new(-1),
                DisabledRouting::Block,
            ),
            IntentBinding::new(
                disabled_binding.clone(),
                intent.clone(),
                disabled_action.clone(),
                BindingPriority::new(7),
                DisabledRouting::FallThrough,
            ),
        ],
    )?;
    let initial = state("router-prepared", "a")?;
    let route = router.route(&initial, &IntentInvocation::without_input(intent.clone()))?;
    assert_eq!(route.intent_id(), &intent);
    assert_eq!(route.base_state(), &initial);
    let IntentRouteOutcome::Prepared(selected) = route else {
        return Err(test_error("enabled fallback did not produce a prepared route").into());
    };
    assert_eq!(selected.binding_id(), &enabled_binding);
    assert_eq!(selected.action_id(), &enabled_action);
    assert_eq!(selected.priority(), BindingPriority::new(-1));
    assert_eq!(selected.indicator(), &ActionStateIndicator::stateless());
    assert_eq!(
        selected.actual_writes(),
        ActionStateDomains::DOCUMENT
            .union(ActionStateDomains::HISTORY)
            .union(ActionStateDomains::SNAPSHOT)
    );
    assert_eq!(selected.fallthroughs().len(), 1);
    assert_eq!(selected.fallthroughs()[0].binding_id(), &disabled_binding);
    assert_eq!(selected.fallthroughs()[0].action_id(), &disabled_action);
    assert_eq!(selected.fallthroughs()[0].priority(), BindingPriority::new(7));
    assert_eq!(selected.fallthroughs()[0].reason(), &reason);
    assert_eq!(count(&disabled_evaluations), 1);
    assert_eq!(count(&enabled_evaluations), 1);

    let mut session = EditorSession::new(initial);
    let outcome = session.execute_intent_route(IntentRouteOutcome::Prepared(selected))?;
    let commit = outcome.commit().ok_or_else(|| test_error("prepared route did not commit"))?;
    assert_eq!(session.state(), commit.after());
    assert_eq!(session.undo_depth(), 1);
    assert_eq!(count(&disabled_evaluations), 1);
    assert_eq!(count(&enabled_evaluations), 1);
    Ok(())
}

#[test]
fn blocking_candidate_stops_before_lower_priority_actions() -> TestResult {
    let intent = intent_id("test/block")?;
    let fallthrough_action = action_id("test/fallthrough")?;
    let blocking_action = action_id("test/blocking")?;
    let unreachable_action = action_id("test/unreachable")?;
    let fallthrough_reason = DisabledReason::new(name("test/fallthrough-reason")?, None);
    let blocking_reason = DisabledReason::new(name("test/blocking-reason")?, None);
    let fallthrough_count = Arc::new(AtomicUsize::new(0));
    let blocking_count = Arc::new(AtomicUsize::new(0));
    let unreachable_count = Arc::new(AtomicUsize::new(0));
    let registry = ActionRegistry::try_new(vec![
        probe_registration(
            fallthrough_action.clone(),
            Arc::clone(&fallthrough_count),
            ProbeBehavior::Disabled(fallthrough_reason.clone()),
        )?,
        probe_registration(
            blocking_action.clone(),
            Arc::clone(&blocking_count),
            ProbeBehavior::Disabled(blocking_reason.clone()),
        )?,
        probe_registration(
            unreachable_action.clone(),
            Arc::clone(&unreachable_count),
            ProbeBehavior::Insert("x"),
        )?,
    ])?;
    let fallthrough_binding = binding(
        "test/fallthrough-binding",
        &intent,
        &fallthrough_action,
        30,
        DisabledRouting::FallThrough,
    )?;
    let blocking_binding =
        binding("test/blocking-binding", &intent, &blocking_action, 20, DisabledRouting::Block)?;
    let unreachable_binding = binding(
        "test/unreachable-binding",
        &intent,
        &unreachable_action,
        10,
        DisabledRouting::FallThrough,
    )?;
    let router = IntentRouter::try_new(
        registry,
        vec![IntentDeclaration::new(intent.clone())],
        vec![unreachable_binding, blocking_binding.clone(), fallthrough_binding.clone()],
    )?;
    let initial = state("router-blocked", "a")?;
    let route = router.route(&initial, &IntentInvocation::without_input(intent.clone()))?;
    let IntentRouteOutcome::Blocked(blocked) = route else {
        return Err(test_error("blocking disabled action did not block the route").into());
    };
    assert_eq!(blocked.intent_id(), &intent);
    assert_eq!(blocked.binding(), &blocking_binding);
    assert_eq!(blocked.reason(), &blocking_reason);
    assert_eq!(blocked.disabled_preparation().id(), &blocking_action);
    assert_eq!(blocked.indicator(), &ActionStateIndicator::stateless());
    assert_eq!(blocked.base_state(), &initial);
    assert_eq!(blocked.fallthroughs().len(), 1);
    assert_eq!(blocked.fallthroughs()[0].binding_id(), fallthrough_binding.id());
    assert_eq!(blocked.fallthroughs()[0].reason(), &fallthrough_reason);
    assert_eq!(count(&fallthrough_count), 1);
    assert_eq!(count(&blocking_count), 1);
    assert_eq!(count(&unreachable_count), 0);
    let receipt = IntentRouteOutcome::Blocked(blocked).execute(&initial)?;
    assert_eq!(receipt.intent_id(), &intent);
    assert_eq!(receipt.base_snapshot(), initial.snapshot());
    assert_eq!(
        receipt.binding().ok_or_else(|| test_error("blocked receipt lost its binding"))?,
        &blocking_binding
    );
    assert_eq!(receipt.blocked_reason(), Some(&blocking_reason));
    assert_eq!(receipt.fallthroughs().len(), 1);
    assert_eq!(receipt.fallthroughs()[0].binding_id(), fallthrough_binding.id());
    assert_eq!(receipt.commit(), None);
    Ok(())
}

#[test]
fn intent_invocation_debug_redacts_typed_payloads() -> TestResult {
    let secret = "secret-intent-invocation-payload";
    let invocation = IntentInvocation::new(
        intent_id("test/debug-intent")?,
        ActionInput::typed(
            input_contract("test/debug-intent-input", 9)?,
            ActionValue::try_from_string(secret)?,
        ),
    );

    let debug = format!("{invocation:?}");
    assert!(!debug.contains(secret));
    assert!(debug.contains("test/debug-intent"));
    assert!(debug.contains("test/debug-intent-input"));
    assert!(debug.contains("String"));
    assert!(debug.contains("<redacted>"));
    Ok(())
}

#[test]
fn typed_input_is_forwarded_unchanged_and_envelope_errors_do_not_evaluate_actions() -> TestResult {
    let intent = intent_id("test/typed-intent")?;
    let action = action_id("test/typed-action")?;
    let binding = binding_id("test/typed-binding")?;
    let contract = input_contract("test/boolean-input", 3)?;
    let other_contract = input_contract("test/other-input", 3)?;
    let evaluations = Arc::new(AtomicUsize::new(0));
    let values = Arc::new(Mutex::new(Vec::new()));
    let reason_code = name("test/typed-disabled")?;
    let lock_fault = ActionFault::new(name("test/test-lock-fault")?, None);
    let registry = ActionRegistry::try_new(vec![ActionRegistration::with_input(
        action.clone(),
        contract.clone(),
        TypedProbeAction {
            evaluations: Arc::clone(&evaluations),
            values: Arc::clone(&values),
            reason_code: reason_code.clone(),
            lock_fault,
        },
    )])?;
    let router = IntentRouter::try_new(
        registry,
        vec![IntentDeclaration::with_input(intent.clone(), contract.clone())],
        vec![IntentBinding::new(
            binding.clone(),
            intent.clone(),
            action.clone(),
            BindingPriority::new(0),
            DisabledRouting::Block,
        )],
    )?;
    let initial = state("router-typed", "a")?;
    let input = ActionInput::typed(contract.clone(), ActionValue::boolean(true));
    let route = router.route(&initial, &IntentInvocation::new(intent.clone(), input.clone()))?;
    let IntentRouteOutcome::Blocked(blocked) = route else {
        return Err(test_error("typed disabled action did not block").into());
    };
    assert_eq!(blocked.binding_id(), &binding);
    assert_eq!(blocked.action_id(), &action);
    assert_eq!(blocked.reason().code(), &reason_code);
    assert_eq!(blocked.reason().detail(), Some(&ActionValue::boolean(true)));
    assert_eq!(count(&evaluations), 1);
    let captured = values.lock().map_err(|error| test_error(error.to_string()))?;
    assert_eq!(captured.as_slice(), &[true]);
    drop(captured);

    assert_eq!(
        router.route(&initial, &IntentInvocation::without_input(intent.clone())).err(),
        Some(IntentRouteError::InvalidInput {
            intent: intent.clone(),
            source: ActionInputError::ExpectedTyped { expected: contract.clone() },
        })
    );
    assert_eq!(
        router
            .route(
                &initial,
                &IntentInvocation::new(
                    intent.clone(),
                    ActionInput::typed(other_contract.clone(), ActionValue::boolean(false)),
                ),
            )
            .err(),
        Some(IntentRouteError::InvalidInput {
            intent,
            source: ActionInputError::ContractMismatch {
                expected: contract,
                actual: other_contract,
            },
        })
    );
    assert_eq!(count(&evaluations), 1);
    assert_eq!(values.lock().map_err(|error| test_error(error.to_string()))?.as_slice(), &[true]);
    assert_eq!(input.contract(), Some(&input_contract("test/boolean-input", 3)?));
    Ok(())
}

#[test]
fn typed_decoder_errors_are_terminal_and_do_not_reach_lower_bindings() -> TestResult {
    let intent = intent_id("test/typed-terminal")?;
    let first_action = action_id("test/first-typed")?;
    let lower_action = action_id("test/lower-typed")?;
    let first_binding = binding_id("test/first-typed-binding")?;
    let contract = input_contract("test/boolean-input", 1)?;
    let first_count = Arc::new(AtomicUsize::new(0));
    let lower_count = Arc::new(AtomicUsize::new(0));
    let values = Arc::new(Mutex::new(Vec::new()));
    let reason_code = name("test/disabled")?;
    let lock_fault = ActionFault::new(name("test/test-lock-fault")?, None);
    let registry = ActionRegistry::try_new(vec![
        ActionRegistration::with_input(
            first_action.clone(),
            contract.clone(),
            TypedProbeAction {
                evaluations: Arc::clone(&first_count),
                values: Arc::clone(&values),
                reason_code: reason_code.clone(),
                lock_fault: lock_fault.clone(),
            },
        ),
        ActionRegistration::with_input(
            lower_action.clone(),
            contract.clone(),
            TypedProbeAction {
                evaluations: Arc::clone(&lower_count),
                values,
                reason_code,
                lock_fault,
            },
        ),
    ])?;
    let router = IntentRouter::try_new(
        registry,
        vec![IntentDeclaration::with_input(intent.clone(), contract.clone())],
        vec![
            binding("test/lower-typed-binding", &intent, &lower_action, 0, DisabledRouting::Block)?,
            IntentBinding::new(
                first_binding.clone(),
                intent.clone(),
                first_action.clone(),
                BindingPriority::new(1),
                DisabledRouting::FallThrough,
            ),
        ],
    )?;
    let initial = state("router-typed-terminal", "a")?;
    let invalid_value = ActionValue::try_from_string("not-a-boolean")?;
    assert!(matches!(
        router.route(
            &initial,
            &IntentInvocation::new(
                intent.clone(),
                ActionInput::typed(contract.clone(), invalid_value),
            ),
        ),
        Err(IntentRouteError::Action {
            intent: error_intent,
            binding,
            action,
            source,
        }) if error_intent == intent
            && binding == first_binding
            && action == first_action
            && *source == ActionPrepareError::InvalidInput {
                id: first_action,
                source: ActionInputError::InvalidValue { code: contract.name().clone() },
            }
    ));
    assert_eq!(count(&first_count), 0);
    assert_eq!(count(&lower_count), 0);
    Ok(())
}

#[test]
fn equal_contract_ids_do_not_hide_divergent_decoder_semantics() -> TestResult {
    let intent = intent_id("test/divergent-decoders")?;
    let permissive_action = action_id("test/permissive-decoder")?;
    let restrictive_action = action_id("test/restrictive-decoder")?;
    let restrictive_binding = binding_id("test/restrictive-binding")?;
    let contract = input_contract("test/shared-boolean-input", 1)?;
    let permissive_count = Arc::new(AtomicUsize::new(0));
    let restrictive_count = Arc::new(AtomicUsize::new(0));
    let values = Arc::new(Mutex::new(Vec::new()));
    let disabled = DisabledReason::new(name("test/fallthrough")?, None);
    let registry = ActionRegistry::try_new(vec![
        ActionRegistration::with_input(
            permissive_action.clone(),
            contract.clone(),
            TypedProbeAction {
                evaluations: Arc::clone(&permissive_count),
                values,
                reason_code: name("test/permissive-disabled")?,
                lock_fault: ActionFault::new(name("test/test-lock-fault")?, None),
            },
        ),
        ActionRegistration::with_input(
            restrictive_action.clone(),
            contract.clone(),
            FalseOnlyProbeAction { evaluations: Arc::clone(&restrictive_count), reason: disabled },
        ),
    ])?;
    let router = IntentRouter::try_new(
        registry,
        vec![IntentDeclaration::with_input(intent.clone(), contract.clone())],
        vec![
            IntentBinding::new(
                restrictive_binding.clone(),
                intent.clone(),
                restrictive_action.clone(),
                BindingPriority::new(0),
                DisabledRouting::Block,
            ),
            binding(
                "test/permissive-binding",
                &intent,
                &permissive_action,
                1,
                DisabledRouting::FallThrough,
            )?,
        ],
    )?;
    let initial = state("router-divergent-decoders", "a")?;

    assert!(matches!(
        router.route(
            &initial,
            &IntentInvocation::new(
                intent.clone(),
                ActionInput::typed(contract.clone(), ActionValue::boolean(true)),
            ),
        ),
        Err(IntentRouteError::Action {
            intent: error_intent,
            binding,
            action,
            source,
        }) if error_intent == intent
            && binding == restrictive_binding
            && action == restrictive_action
            && *source == ActionPrepareError::InvalidInput {
                id: restrictive_action,
                source: ActionInputError::InvalidValue { code: contract.name().clone() },
            }
    ));
    assert_eq!(count(&permissive_count), 1);
    assert_eq!(count(&restrictive_count), 0);
    Ok(())
}

#[test]
fn action_faults_are_terminal_and_never_fall_through() -> TestResult {
    let intent = intent_id("test/terminal")?;
    let terminal_action = action_id("test/terminal-action")?;
    let fallback_action = action_id("test/fallback-action")?;
    let terminal_binding = binding_id("test/terminal-binding")?;
    let fallback_binding = binding_id("test/fallback-binding")?;
    let terminal_count = Arc::new(AtomicUsize::new(0));
    let fallback_count = Arc::new(AtomicUsize::new(0));
    let fault = ActionFault::new(name("test/handler-fault")?, None);
    let registry = ActionRegistry::try_new(vec![
        probe_registration(
            terminal_action.clone(),
            Arc::clone(&terminal_count),
            ProbeBehavior::Fault(fault.clone()),
        )?,
        probe_registration(
            fallback_action.clone(),
            Arc::clone(&fallback_count),
            ProbeBehavior::Insert("x"),
        )?,
    ])?;
    let router = IntentRouter::try_new(
        registry,
        vec![IntentDeclaration::new(intent.clone())],
        vec![
            IntentBinding::new(
                fallback_binding,
                intent.clone(),
                fallback_action,
                BindingPriority::new(0),
                DisabledRouting::Block,
            ),
            IntentBinding::new(
                terminal_binding.clone(),
                intent.clone(),
                terminal_action.clone(),
                BindingPriority::new(1),
                DisabledRouting::FallThrough,
            ),
        ],
    )?;
    let initial = state("router-terminal-fault", "a")?;
    assert!(matches!(
        router.route(&initial, &IntentInvocation::without_input(intent.clone())),
        Err(IntentRouteError::Action {
            intent: error_intent,
            binding,
            action,
            source,
        }) if error_intent == intent
            && binding == terminal_binding
            && action == terminal_action
            && *source == ActionPrepareError::Fault { id: terminal_action, source: fault }
    ));
    assert_eq!(count(&terminal_count), 1);
    assert_eq!(count(&fallback_count), 0);

    Ok(())
}

#[test]
fn invalid_plans_are_terminal_and_never_fall_through() -> TestResult {
    let intent = intent_id("test/terminal")?;
    let invalid_action = action_id("test/invalid-plan")?;
    let invalid_binding = binding_id("test/invalid-binding")?;
    let invalid_count = Arc::new(AtomicUsize::new(0));
    let fallback_count = Arc::new(AtomicUsize::new(0));
    let registry = ActionRegistry::try_new(vec![
        probe_registration(
            invalid_action.clone(),
            Arc::clone(&invalid_count),
            ProbeBehavior::InvalidNoOp,
        )?,
        probe_registration(
            action_id("test/lower-action")?,
            Arc::clone(&fallback_count),
            ProbeBehavior::Insert("x"),
        )?,
    ])?;
    let router = IntentRouter::try_new(
        registry,
        vec![IntentDeclaration::new(intent.clone())],
        vec![
            binding(
                "test/lower-binding",
                &intent,
                &action_id("test/lower-action")?,
                0,
                DisabledRouting::Block,
            )?,
            IntentBinding::new(
                invalid_binding.clone(),
                intent.clone(),
                invalid_action.clone(),
                BindingPriority::new(1),
                DisabledRouting::FallThrough,
            ),
        ],
    )?;
    let initial = state("router-terminal-invalid-plan", "a")?;
    assert!(matches!(
        router.route(&initial, &IntentInvocation::without_input(intent.clone())),
        Err(IntentRouteError::Action {
            intent: error_intent,
            binding,
            action,
            source,
        }) if error_intent == intent
            && binding == invalid_binding
            && action == invalid_action
            && *source == ActionPrepareError::InvalidPlan {
                id: invalid_action,
                source: InvalidActionPlan::Unchanged,
            }
    ));
    assert_eq!(count(&invalid_count), 1);
    assert_eq!(count(&fallback_count), 0);
    Ok(())
}

#[test]
fn routed_error_debug_redacts_transaction_and_document_payloads() -> TestResult {
    let document_secret = "routed-secret";
    let expected_secret = "wrong-content";
    let intent = intent_id("test/debug-error-intent")?;
    let action = action_id("test/debug-error-action")?;
    let binding = binding_id("test/debug-error-binding")?;
    let registry = ActionRegistry::try_new(vec![probe_registration(
        action.clone(),
        Arc::new(AtomicUsize::new(0)),
        ProbeBehavior::ExpectedRemovedMismatch(expected_secret),
    )?])?;
    let router = IntentRouter::try_new(
        registry,
        vec![IntentDeclaration::new(intent.clone())],
        vec![IntentBinding::new(
            binding,
            intent.clone(),
            action,
            BindingPriority::default(),
            DisabledRouting::Block,
        )],
    )?;
    let state = state("router-error-debug-redaction", document_secret)?;

    let Err(error) = router.route(&state, &IntentInvocation::without_input(intent)) else {
        return Err(test_error("mismatched routed action unexpectedly prepared").into());
    };
    let debug = format!("{error:?}");
    assert!(!debug.contains(document_secret));
    assert!(!debug.contains(expected_secret));
    assert!(debug.contains("test/debug-error-intent"));
    assert!(debug.contains("test/debug-error-binding"));
    assert!(debug.contains("test/debug-error-action"));
    assert!(debug.contains("operation"));
    Ok(())
}

#[test]
fn direct_and_routed_preparations_are_identical_and_debug_redacts_document_content() -> TestResult {
    let intent = intent_id("test/equivalence")?;
    let action = action_id("test/insert")?;
    let evaluations = Arc::new(AtomicUsize::new(0));
    let registry = ActionRegistry::try_new(vec![probe_registration(
        action.clone(),
        Arc::clone(&evaluations),
        ProbeBehavior::Insert("x"),
    )?])?;
    let router = IntentRouter::try_new(
        registry.clone(),
        vec![IntentDeclaration::new(intent.clone())],
        vec![binding("test/insert-binding", &intent, &action, 0, DisabledRouting::Block)?],
    )?;
    let secret = "secret-document-content";
    let initial = state("router-equivalence", secret)?;
    let direct = registry.prepare(&initial, &ActionInvocation::without_input(action.clone()))?;
    let route = router.route(&initial, &IntentInvocation::without_input(intent))?;
    let debug = format!("{route:?}");
    assert!(!debug.contains(secret));
    let IntentRouteOutcome::Prepared(selected) = route else {
        return Err(test_error("insertion route was not prepared").into());
    };
    assert_eq!(selected.prepared_action().id(), &action);
    assert_eq!(selected.into_preparation(), direct);
    assert_eq!(count(&evaluations), 2);
    Ok(())
}

#[test]
fn cached_prepared_route_executes_once_without_reevaluation() -> TestResult {
    let intent = intent_id("test/cached")?;
    let action = action_id("test/insert")?;
    let routed_binding = binding_id("test/cached-binding")?;
    let evaluations = Arc::new(AtomicUsize::new(0));
    let registry = ActionRegistry::try_new(vec![probe_registration(
        action.clone(),
        Arc::clone(&evaluations),
        ProbeBehavior::Insert("x"),
    )?])?;
    let router = IntentRouter::try_new(
        registry,
        vec![IntentDeclaration::new(intent.clone())],
        vec![IntentBinding::new(
            routed_binding.clone(),
            intent.clone(),
            action,
            BindingPriority::new(0),
            DisabledRouting::Block,
        )],
    )?;
    let secret = "secret-cached-route-content";
    let initial = state("router-cached", secret)?;
    let route = router.route(&initial, &IntentInvocation::without_input(intent.clone()))?;
    assert_eq!(count(&evaluations), 1);
    let mut session = EditorSession::new(initial.clone());
    let outcome = session.execute_intent_route(route)?;
    assert_eq!(outcome.intent_id(), &intent);
    assert_eq!(outcome.base_snapshot(), initial.snapshot());
    assert_eq!(
        outcome.binding().ok_or_else(|| test_error("committed receipt lost its binding"))?.id(),
        &routed_binding
    );
    assert!(outcome.fallthroughs().is_empty());
    assert_eq!(outcome.blocked_reason(), None);
    assert!(!format!("{outcome:?}").contains(secret));
    let commit =
        outcome.into_commit().ok_or_else(|| test_error("prepared route did not commit"))?;
    assert_eq!(commit.before(), &initial);
    assert_eq!(session.state(), commit.after());
    assert_eq!(count(&evaluations), 1);
    Ok(())
}

#[test]
fn prepared_routes_are_bound_to_the_complete_exact_base_state() -> TestResult {
    let intent = intent_id("test/stale")?;
    let action = action_id("test/insert")?;
    let routed_binding = binding_id("test/stale-binding")?;
    let evaluations = Arc::new(AtomicUsize::new(0));
    let registry = ActionRegistry::try_new(vec![probe_registration(
        action.clone(),
        Arc::clone(&evaluations),
        ProbeBehavior::Insert("x"),
    )?])?;
    let router = IntentRouter::try_new(
        registry.clone(),
        vec![IntentDeclaration::new(intent.clone())],
        vec![IntentBinding::new(
            routed_binding.clone(),
            intent.clone(),
            action.clone(),
            BindingPriority::new(0),
            DisabledRouting::Block,
        )],
    )?;
    let initial = state("router-stale", "a")?;
    let stale_route = router.route(&initial, &IntentInvocation::without_input(intent.clone()))?;
    let direct = registry.prepare(&initial, &ActionInvocation::without_input(action))?;
    let mut session = EditorSession::new(initial.clone());
    session.execute_prepared_action(direct)?;
    let current = session.state().clone();
    assert!(matches!(
        session.execute_intent_route(stale_route),
        Err(IntentRouteBaseError::StaleSnapshot {
            intent: error_intent,
            binding: Some(error_binding),
            ..
        }) if error_intent == intent && error_binding.id() == &routed_binding
    ));
    assert_eq!(session.state(), &current);
    assert_eq!(session.undo_depth(), 1);
    assert_eq!(session.redo_depth(), 0);
    assert_eq!(count(&evaluations), 2);
    Ok(())
}

#[test]
fn unavailable_routes_check_exact_base_before_reporting_unavailability() -> TestResult {
    let intent = intent_id("test/exact-disabled")?;
    let action = action_id("test/disabled")?;
    let blocking_binding = binding_id("test/disabled-binding")?;
    let reason = DisabledReason::new(name("test/disabled")?, None);
    let registry = ActionRegistry::try_new(vec![probe_registration(
        action.clone(),
        Arc::new(AtomicUsize::new(0)),
        ProbeBehavior::Disabled(reason.clone()),
    )?])?;
    let router = IntentRouter::try_new(
        registry,
        vec![IntentDeclaration::new(intent.clone())],
        vec![IntentBinding::new(
            blocking_binding.clone(),
            intent.clone(),
            action,
            BindingPriority::new(0),
            DisabledRouting::Block,
        )],
    )?;
    let secret = "secret-unavailable-document-content";
    let initial = state("router-reused-snapshot", secret)?;
    let reused = state("router-reused-snapshot", "different")?;
    assert_eq!(initial.snapshot(), reused.snapshot());
    let blocked = router.route(&initial, &IntentInvocation::without_input(intent.clone()))?;
    assert!(!format!("{blocked:?}").contains(secret));
    assert!(matches!(
        blocked.execute(&reused),
        Err(IntentRouteBaseError::BaseStateMismatch {
            intent: error_intent,
            binding: Some(error_binding),
            ..
        }) if error_intent == intent && error_binding.id() == &blocking_binding
    ));

    let mut blocked_session = EditorSession::new(initial.clone());
    let blocked = router.route(&initial, &IntentInvocation::without_input(intent.clone()))?;
    assert!(matches!(
        blocked_session.execute_intent_route(blocked),
        Ok(IntentExecutionOutcome::Blocked {
            intent: error_intent,
            base_snapshot,
            binding: error_binding,
            reason: error_reason,
            fallthroughs,
        }) if error_intent == intent
            && base_snapshot == initial.snapshot().clone()
            && error_binding.id() == &blocking_binding
            && error_reason == reason
            && fallthroughs.is_empty()
    ));
    assert_eq!(blocked_session.state(), &initial);
    assert_eq!(blocked_session.undo_depth(), 0);
    assert_eq!(blocked_session.redo_depth(), 0);

    let empty_intent = intent_id("test/empty-exact")?;
    let empty_router = IntentRouter::try_new(
        ActionRegistry::default(),
        vec![IntentDeclaration::new(empty_intent.clone())],
        Vec::new(),
    )?;
    let unhandled =
        empty_router.route(&initial, &IntentInvocation::without_input(empty_intent.clone()))?;
    assert!(!format!("{unhandled:?}").contains(secret));
    assert!(matches!(
        unhandled.execute(&reused),
        Err(IntentRouteBaseError::BaseStateMismatch {
            intent: error_intent,
            binding: None,
            ..
        }) if error_intent == empty_intent
    ));

    let mut unhandled_session = EditorSession::new(initial.clone());
    let unhandled =
        empty_router.route(&initial, &IntentInvocation::without_input(empty_intent.clone()))?;
    assert!(matches!(
        unhandled_session.execute_intent_route(unhandled),
        Ok(IntentExecutionOutcome::Unhandled { intent, base_snapshot, fallthroughs })
            if intent == empty_intent
                && base_snapshot == initial.snapshot().clone()
                && fallthroughs.is_empty()
    ));
    assert_eq!(unhandled_session.state(), &initial);
    assert_eq!(unhandled_session.undo_depth(), 0);
    assert_eq!(unhandled_session.redo_depth(), 0);
    Ok(())
}

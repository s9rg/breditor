use std::{cmp::Reverse, collections::BTreeMap, fmt, sync::Arc};

use crate::{
    action::{ActionInvocation, ActionPreparation, ActionRegistry, input::validate_input_contract},
    state::EditorState,
};

use super::{
    BindingId, BindingPriority, BlockedIntent, DisabledRouting, IntentBinding, IntentDeclaration,
    IntentFallThrough, IntentId, IntentInvocation, IntentRouteError, IntentRouteOutcome,
    IntentRouterError, MAX_BINDINGS_PER_INTENT, MAX_INTENT_BINDINGS, MAX_INTENT_DECLARATIONS,
    RoutedAction, UnhandledIntent,
};

struct RouterInner {
    actions: ActionRegistry,
    declarations: BTreeMap<IntentId, IntentDeclaration>,
    bindings: BTreeMap<BindingId, IntentBinding>,
    routes: BTreeMap<IntentId, Box<[IntentBinding]>>,
}

/// Immutable deterministic semantic intent router over one frozen action registry.
///
/// Declarations and bindings are enumerated lexically. Runtime candidates are
/// evaluated by descending signed priority, which is unique within each intent.
/// The router owns no DOM syntax, dynamic callbacks, mutable state, or fallback
/// behavior beyond each binding's explicit [`DisabledRouting`].
#[derive(Clone)]
pub struct IntentRouter {
    inner: Arc<RouterInner>,
}

impl IntentRouter {
    /// Validates and freezes declared intents and their action bindings.
    ///
    /// Validation runs in fixed canonical phases: declaration count, total
    /// binding count, per-intent binding count, declaration identities, binding
    /// identities, references and contracts, priority conflicts, then repeated
    /// actions. Per-intent overflow selects the lexical first intent. Identity
    /// and reference phases use lexical IDs; priority and repeated-action phases
    /// use their ordered `(intent, priority)` and `(intent, action)` keys.
    /// Registration order never selects the reported conflict.
    ///
    /// # Errors
    ///
    /// Returns [`IntentRouterError`] when a fixed graph bound is exceeded, an
    /// identity is duplicated, a binding names an unknown declaration or action,
    /// contracts differ, priorities tie, or one intent targets an action more
    /// than once. No partial router is returned.
    pub fn try_new(
        actions: ActionRegistry,
        mut declarations: Vec<IntentDeclaration>,
        mut bindings: Vec<IntentBinding>,
    ) -> Result<Self, IntentRouterError> {
        validate_resource_limits(&declarations, &bindings)?;

        declarations.sort_by(|left, right| left.id().cmp(right.id()));
        for pair in declarations.windows(2) {
            if pair[0].id() == pair[1].id() {
                return Err(IntentRouterError::DuplicateIntentId { id: pair[0].id().clone() });
            }
        }

        bindings.sort_by(|left, right| left.id().cmp(right.id()));
        for pair in bindings.windows(2) {
            if pair[0].id() == pair[1].id() {
                return Err(IntentRouterError::DuplicateBindingId { id: pair[0].id().clone() });
            }
        }

        let declarations = declarations
            .into_iter()
            .map(|declaration| (declaration.id().clone(), declaration))
            .collect::<BTreeMap<_, _>>();

        for binding in &bindings {
            let declaration = declarations.get(binding.intent_id()).ok_or_else(|| {
                IntentRouterError::UnknownIntent {
                    binding: binding.id().clone(),
                    intent: binding.intent_id().clone(),
                }
            })?;
            let descriptor = actions.descriptor(binding.action_id()).ok_or_else(|| {
                IntentRouterError::UnknownAction {
                    binding: binding.id().clone(),
                    action: binding.action_id().clone(),
                }
            })?;
            if declaration.input_contract() != descriptor.input_contract() {
                return Err(IntentRouterError::InputContractMismatch {
                    intent: binding.intent_id().clone(),
                    binding: binding.id().clone(),
                    action: binding.action_id().clone(),
                    expected: declaration.input_contract().cloned(),
                    actual: descriptor.input_contract().cloned(),
                });
            }
        }

        validate_unique_priorities(&bindings)?;
        validate_unique_actions(&bindings)?;

        let mut routes = declarations
            .keys()
            .cloned()
            .map(|intent| (intent, Vec::new()))
            .collect::<BTreeMap<_, _>>();
        for binding in &bindings {
            routes.entry(binding.intent_id().clone()).or_default().push(binding.clone());
        }
        let routes = routes
            .into_iter()
            .map(|(intent, mut route)| {
                route.sort_by_key(|binding| Reverse(binding.priority()));
                (intent, route.into_boxed_slice())
            })
            .collect();
        let bindings =
            bindings.into_iter().map(|binding| (binding.id().clone(), binding)).collect();

        Ok(Self { inner: Arc::new(RouterInner { actions, declarations, bindings, routes }) })
    }

    /// Returns the frozen action registry used for every route.
    #[must_use]
    pub fn action_registry(&self) -> &ActionRegistry {
        &self.inner.actions
    }

    /// Returns the number of declared semantic intents.
    #[must_use]
    pub fn intent_count(&self) -> usize {
        self.inner.declarations.len()
    }

    /// Returns the number of frozen intent bindings.
    #[must_use]
    pub fn binding_count(&self) -> usize {
        self.inner.bindings.len()
    }

    /// Returns whether the router has no declared semantic intents.
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.inner.declarations.is_empty()
    }

    /// Looks up one semantic intent declaration.
    #[must_use]
    pub fn declaration(&self, id: &IntentId) -> Option<&IntentDeclaration> {
        self.inner.declarations.get(id)
    }

    /// Iterates declarations in canonical lexical intent-ID order.
    #[must_use]
    pub fn declarations(&self) -> impl ExactSizeIterator<Item = &IntentDeclaration> {
        self.inner.declarations.values()
    }

    /// Looks up one binding descriptor by its global identity.
    #[must_use]
    pub fn binding(&self, id: &BindingId) -> Option<&IntentBinding> {
        self.inner.bindings.get(id)
    }

    /// Iterates bindings in canonical lexical binding-ID order.
    #[must_use]
    pub fn bindings(&self) -> impl ExactSizeIterator<Item = &IntentBinding> {
        self.inner.bindings.values()
    }

    /// Returns one declared intent's bindings in runtime priority order.
    ///
    /// An empty slice distinguishes a declared intent with no bindings from an
    /// undeclared intent, which returns `None`.
    #[must_use]
    pub fn bindings_for_intent(&self, id: &IntentId) -> Option<&[IntentBinding]> {
        self.inner.routes.get(id).map(AsRef::as_ref)
    }

    /// Routes one invocation against an exact immutable editor state.
    ///
    /// Expected-disabled candidates either fall through with a retained trace or
    /// return a blocked outcome according to their binding. The first enabled
    /// candidate returns its already-preflighted [`crate::action::PreparedAction`].
    /// Any malformed input, handler fault, or invalid plan is terminal and never
    /// falls through.
    ///
    /// # Errors
    ///
    /// Returns [`IntentRouteError`] for an undeclared intent, malformed shared
    /// input, or terminal candidate action failure.
    pub fn route(
        &self,
        state: &EditorState,
        invocation: &IntentInvocation,
    ) -> Result<IntentRouteOutcome, IntentRouteError> {
        let declaration =
            self.inner.declarations.get(invocation.id()).ok_or_else(|| {
                IntentRouteError::UnknownIntent { intent: invocation.id().clone() }
            })?;
        validate_input_contract(declaration.input_contract(), invocation.input()).map_err(
            |source| IntentRouteError::InvalidInput { intent: invocation.id().clone(), source },
        )?;

        let bindings =
            self.inner.routes.get(invocation.id()).map_or(&[][..], |route| route.as_ref());
        let mut fallthroughs = Vec::new();
        for binding in bindings {
            let action_invocation =
                ActionInvocation::new(binding.action_id().clone(), invocation.input().clone());
            let preparation =
                self.inner.actions.prepare(state, &action_invocation).map_err(|source| {
                    IntentRouteError::Action {
                        intent: invocation.id().clone(),
                        binding: binding.id().clone(),
                        action: binding.action_id().clone(),
                        source: Box::new(source),
                    }
                })?;
            match preparation {
                ActionPreparation::Enabled(prepared) => {
                    return Ok(IntentRouteOutcome::Prepared(RoutedAction::new(
                        invocation.id().clone(),
                        binding.clone(),
                        prepared,
                        fallthroughs,
                    )));
                }
                ActionPreparation::Disabled(disabled) => {
                    let (base, reason) = disabled.into_base_and_reason();
                    if binding.disabled_routing() == DisabledRouting::Block {
                        return Ok(IntentRouteOutcome::Blocked(BlockedIntent::new(
                            invocation.id().clone(),
                            binding.clone(),
                            base,
                            reason,
                            fallthroughs,
                        )));
                    }
                    fallthroughs.push(IntentFallThrough::new(
                        binding.id().clone(),
                        binding.action_id().clone(),
                        binding.priority(),
                        reason,
                    ));
                }
            }
        }
        Ok(IntentRouteOutcome::Unhandled(UnhandledIntent::new(
            invocation.id().clone(),
            state.clone(),
            fallthroughs,
        )))
    }
}

fn validate_resource_limits(
    declarations: &[IntentDeclaration],
    bindings: &[IntentBinding],
) -> Result<(), IntentRouterError> {
    let declaration_count = fixed_count(declarations.len());
    if declaration_count > MAX_INTENT_DECLARATIONS {
        return Err(IntentRouterError::TooManyIntentDeclarations {
            actual: declaration_count,
            maximum: MAX_INTENT_DECLARATIONS,
        });
    }

    let binding_count = fixed_count(bindings.len());
    if binding_count > MAX_INTENT_BINDINGS {
        return Err(IntentRouterError::TooManyIntentBindings {
            actual: binding_count,
            maximum: MAX_INTENT_BINDINGS,
        });
    }

    let mut per_intent = BTreeMap::<IntentId, u32>::new();
    for binding in bindings {
        let count = per_intent.entry(binding.intent_id().clone()).or_default();
        *count = count.saturating_add(1);
    }
    for (intent, actual) in per_intent {
        if actual > MAX_BINDINGS_PER_INTENT {
            return Err(IntentRouterError::TooManyBindingsForIntent {
                intent,
                actual,
                maximum: MAX_BINDINGS_PER_INTENT,
            });
        }
    }
    Ok(())
}

fn fixed_count(value: usize) -> u32 {
    u32::try_from(value).unwrap_or(u32::MAX)
}

impl fmt::Debug for IntentRouter {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("IntentRouter")
            .field("declarations", &self.declarations().collect::<Vec<_>>())
            .field("bindings", &self.bindings().collect::<Vec<_>>())
            .finish()
    }
}

fn validate_unique_priorities(bindings: &[IntentBinding]) -> Result<(), IntentRouterError> {
    let mut groups = BTreeMap::<(IntentId, BindingPriority), Vec<BindingId>>::new();
    for binding in bindings {
        groups
            .entry((binding.intent_id().clone(), binding.priority()))
            .or_default()
            .push(binding.id().clone());
    }
    for ((intent, priority), ids) in groups {
        if let [first, second, ..] = ids.as_slice() {
            return Err(IntentRouterError::DuplicatePriority {
                intent,
                priority,
                bindings: [first.clone(), second.clone()],
            });
        }
    }
    Ok(())
}

fn validate_unique_actions(bindings: &[IntentBinding]) -> Result<(), IntentRouterError> {
    let mut groups = BTreeMap::<(IntentId, crate::action::ActionId), Vec<BindingId>>::new();
    for binding in bindings {
        groups
            .entry((binding.intent_id().clone(), binding.action_id().clone()))
            .or_default()
            .push(binding.id().clone());
    }
    for ((intent, action), ids) in groups {
        if let [first, second, ..] = ids.as_slice() {
            return Err(IntentRouterError::DuplicateAction {
                intent,
                action,
                bindings: [first.clone(), second.clone()],
            });
        }
    }
    Ok(())
}

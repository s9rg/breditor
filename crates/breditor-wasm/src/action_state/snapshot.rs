use breditor_core::action::{
    ActionActivation, ActionStateCacheUpdate, ActionStateEntry, ActionStateId, ActionStateOutcome,
    ObservedAvailability, ResolvedActionState,
};
use wasm_bindgen::prelude::wasm_bindgen;

use crate::{
    BreditorStringResult,
    action_value_json::{action_value_json, state_value_status},
};

/// Complete immutable non-JSON action-state view for one exact editor instant.
///
/// Entries are in canonical lexical ID order. `changed` IDs are also lexical,
/// unique, and a subset of the entries: all entries for a full baseline, none
/// for an exact cache hit, and the core-proved changed subset for a delta.
/// Numeric indexes are raw `u32` transport values; the reviewed browser adapter
/// must reject non-integer JavaScript values before calling generated glue.
#[wasm_bindgen]
pub struct BreditorActionStateSnapshot {
    observation: breditor_core::action::ActionStateObservation,
    changed_ids: Box<[ActionStateId]>,
}

impl BreditorActionStateSnapshot {
    pub(crate) fn from_update(update: &ActionStateCacheUpdate) -> Self {
        let observation = update.observation().clone();
        let changed_ids = if update.is_full() {
            observation.batch().entries().iter().map(|entry| entry.id().clone()).collect::<Vec<_>>()
        } else {
            update.delta().map_or_else(Vec::new, |delta| delta.changed_ids().to_vec())
        };
        Self { observation, changed_ids: changed_ids.into_boxed_slice() }
    }

    fn entry(&self, index: u32) -> Option<&ActionStateEntry> {
        self.observation.batch().entries().get(index as usize)
    }

    fn resolved(&self, index: u32) -> Option<&ResolvedActionState> {
        match self.entry(index)?.outcome() {
            ActionStateOutcome::Resolved(resolved) => Some(resolved),
            ActionStateOutcome::Unhandled(_) | ActionStateOutcome::Fault(_) => None,
        }
    }
}

#[wasm_bindgen]
impl BreditorActionStateSnapshot {
    /// Returns the lineage of the exact editor state evaluated by every entry.
    #[must_use]
    #[wasm_bindgen(getter, js_name = snapshotLineage)]
    pub fn snapshot_lineage(&self) -> String {
        self.observation.batch().base_snapshot().lineage().as_str().to_owned()
    }

    /// Returns the full-width evaluated revision as canonical decimal text.
    #[must_use]
    #[wasm_bindgen(getter, js_name = snapshotRevision)]
    pub fn snapshot_revision(&self) -> String {
        self.observation.batch().base_snapshot().revision().get().to_string()
    }

    /// Returns the number of complete catalog entries.
    #[must_use]
    #[wasm_bindgen(getter, js_name = entryCount)]
    pub fn entry_count(&self) -> u32 {
        self.observation.batch().summary().entry_count()
    }

    /// Returns one stable observable identity.
    #[must_use]
    #[wasm_bindgen(js_name = entryId)]
    pub fn entry_id(&self, index: u32) -> Option<String> {
        self.entry(index).map(|entry| entry.id().as_str().to_owned())
    }

    /// Returns one authoritative availability or failure category.
    #[must_use]
    #[wasm_bindgen(
        js_name = entryStatus,
        unchecked_return_type = "BreditorActionStateEntryStatus | undefined"
    )]
    pub fn entry_status(&self, index: u32) -> Option<String> {
        self.entry(index).map(|entry| {
            match entry.outcome() {
                ActionStateOutcome::Resolved(resolved) => match resolved.availability() {
                    ObservedAvailability::Enabled => "enabled",
                    ObservedAvailability::Disabled(_) => "disabled",
                    ObservedAvailability::Blocked(_) => "blocked",
                },
                ActionStateOutcome::Unhandled(_) => "unhandled",
                ActionStateOutcome::Fault(_) => "fault",
            }
            .to_owned()
        })
    }

    /// Returns activation for a resolved entry.
    #[must_use]
    #[wasm_bindgen(
        js_name = entryActivation,
        unchecked_return_type = "BreditorActionActivation | undefined"
    )]
    pub fn entry_activation(&self, index: u32) -> Option<String> {
        self.resolved(index).map(|resolved| {
            match resolved.indicator().activation() {
                ActionActivation::Stateless => "stateless",
                ActionActivation::Inactive => "inactive",
                ActionActivation::Active => "active",
                ActionActivation::Mixed => "mixed",
            }
            .to_owned()
        })
    }

    /// Returns the stable disabled or blocked reason code.
    #[must_use]
    #[wasm_bindgen(js_name = entryReasonCode)]
    pub fn entry_reason_code(&self, index: u32) -> Option<String> {
        self.resolved(index)
            .and_then(|resolved| resolved.availability().reason())
            .map(|reason| reason.code().as_str().to_owned())
    }

    /// Returns `unsupported`, `unset`, `uniform`, or `mixed` for a resolved entry.
    #[must_use]
    #[wasm_bindgen(
        js_name = entryValueStatus,
        unchecked_return_type = "BreditorActionStateValueStatus | undefined"
    )]
    pub fn entry_value_status(&self, index: u32) -> Option<String> {
        self.resolved(index)
            .map(|resolved| state_value_status(resolved.indicator().value()).to_owned())
    }

    /// Returns the qualified value-contract name when the entry supports values.
    #[must_use]
    #[wasm_bindgen(js_name = entryValueContractName)]
    pub fn entry_value_contract_name(&self, index: u32) -> Option<String> {
        self.resolved(index)
            .and_then(|resolved| resolved.indicator().value().contract())
            .map(|contract| contract.name().as_str().to_owned())
    }

    /// Returns the nonzero value-contract version when the entry supports values.
    #[must_use]
    #[wasm_bindgen(js_name = entryValueContractVersion)]
    pub fn entry_value_contract_version(&self, index: u32) -> Option<u32> {
        self.resolved(index)
            .and_then(|resolved| resolved.indicator().value().contract())
            .map(|contract| contract.version().get())
    }

    /// Separately encodes one bounded uniform action value.
    ///
    /// `absent` means the index is invalid, the entry is unresolved, or its
    /// value status is unsupported, unset, or mixed. This isolated payload is
    /// not an encoding of the complete action-state snapshot.
    #[must_use]
    #[wasm_bindgen(js_name = entryUniformValueJson)]
    pub fn entry_uniform_value_json(&self, index: u32) -> BreditorStringResult {
        self.resolved(index)
            .and_then(|resolved| resolved.indicator().value().uniform_value())
            .map_or_else(BreditorStringResult::absent, action_value_json)
    }

    /// Returns the number of rerender-hint IDs paired with this complete view.
    #[must_use]
    #[wasm_bindgen(getter, js_name = changedCount)]
    pub fn changed_count(&self) -> u32 {
        u32::try_from(self.changed_ids.len()).unwrap_or(u32::MAX)
    }

    /// Returns one canonical changed observable identity.
    #[must_use]
    #[wasm_bindgen(js_name = changedId)]
    pub fn changed_id(&self, index: u32) -> Option<String> {
        self.changed_ids.get(index as usize).map(|id| id.as_str().to_owned())
    }
}

#[cfg(test)]
mod tests {
    use std::error::Error;

    use breditor_core::{
        action::{
            ActionActivation, ActionActivationContract, ActionEffects, ActionFault, ActionId,
            ActionInvocation, ActionRegistration, ActionRegistry, ActionStateCache,
            ActionStateCatalog, ActionStateContract, ActionStateDomains, ActionStateId,
            ActionStateIndicator, ActionStateRegistration, ActionStateSource, ActionStateSpec,
            ActionStateValue, ActionStateValueContract, ActionStateValueVersion, ActionValue,
            DisabledReason,
            routing::{
                BindingId, BindingPriority, DisabledRouting, IntentBinding, IntentDeclaration,
                IntentId, IntentInvocation, IntentRouter,
            },
        },
        codec::DocumentJsonCodec,
        identity::QualifiedName,
        session::EditorSession,
        state::{EditorContext, EditorState, LineageId},
    };

    use crate::action_state::abi_fixture_action::AbiFixtureAction;

    use super::*;

    const EMPTY_DOCUMENT_JSON: &str = r#"{
      "format":"breditor/document","formatVersion":1,
      "schema":{"name":"breditor/base","version":1},
      "root":{"kind":"element","type":"breditor/document","entityId":null,"properties":{},
        "children":[{"kind":"element","type":"breditor/paragraph","entityId":null,
          "properties":{},"children":[]}]}
    }"#;

    #[test]
    fn uniform_values_expose_contract_and_an_isolated_canonical_owned_payload()
    -> Result<(), Box<dyn Error>> {
        let contract = ActionStateValueContract::new(
            QualifiedName::try_new("test/control-value")?,
            ActionStateValueVersion::one(),
        );
        let value = ActionValue::try_object(vec![
            ("z".to_owned(), ActionValue::try_from_string("é")?),
            ("a".to_owned(), ActionValue::boolean(true)),
        ])?;
        let action_id = ActionId::try_new("test/value-action")?;
        let reason = DisabledReason::new(QualifiedName::try_new("test/value-disabled")?, None);
        let registration = ActionRegistration::without_input(
            action_id.clone(),
            AbiFixtureAction::disabled(
                reason,
                ActionStateIndicator::new(
                    ActionActivation::Stateless,
                    ActionStateValue::uniform(contract.clone(), value),
                ),
            ),
        )
        .with_state_spec(ActionStateSpec::new(
            ActionStateContract::new(ActionActivationContract::Stateless, Some(contract)),
            ActionEffects::new(ActionStateDomains::NONE, ActionStateDomains::NONE),
        ));
        let registry = ActionRegistry::try_new(vec![registration])?;
        let catalog = ActionStateCatalog::try_new(
            registry,
            vec![ActionStateRegistration::new(
                ActionStateId::try_new("test/value-control")?,
                ActionStateSource::direct(ActionInvocation::without_input(action_id)),
            )],
        )?;

        let context = EditorContext::default();
        let document = DocumentJsonCodec::new(context.schema().clone())
            .with_limits(context.limits().clone())
            .decode(EMPTY_DOCUMENT_JSON)?;
        let state = EditorState::try_new(
            &context,
            LineageId::try_new("wasm-uniform-action-value")?,
            document,
            None,
            None,
        )?;
        let mut cache = ActionStateCache::new(catalog);
        let update = cache.refresh(&EditorSession::new(state))?;
        let snapshot = BreditorActionStateSnapshot::from_update(&update);

        assert_eq!(snapshot.entry_status(0).as_deref(), Some("disabled"));
        assert_eq!(snapshot.entry_value_status(0).as_deref(), Some("uniform"));
        assert_eq!(snapshot.entry_value_contract_name(0).as_deref(), Some("test/control-value"));
        assert_eq!(snapshot.entry_value_contract_version(0), Some(1));
        let mut encoded = snapshot.entry_uniform_value_json(0);
        assert_eq!(encoded.status(), "value");
        assert_eq!(encoded.take_value().as_deref(), Some(r#"{"a":true,"z":"é"}"#));
        assert_eq!(encoded.status(), "taken");
        assert_eq!(snapshot.entry_uniform_value_json(1).status(), "absent");
        Ok(())
    }

    #[test]
    fn unresolved_blocked_unset_and_mixed_branches_are_exact_and_total()
    -> Result<(), Box<dyn Error>> {
        let snapshot = branch_snapshot()?;

        assert_eq!(snapshot.entry_count(), 5);
        assert_entry_identity(&snapshot, 0, "test/blocked-control");
        assert_eq!(snapshot.entry_status(0).as_deref(), Some("blocked"));
        assert_eq!(snapshot.entry_activation(0).as_deref(), Some("inactive"));
        assert_eq!(snapshot.entry_reason_code(0).as_deref(), Some("test/blocked-reason"));
        assert_value_contract(&snapshot, 0, "unset", "test/branch-value");

        assert_entry_identity(&snapshot, 1, "test/fault-control");
        assert_unresolved_entry(&snapshot, 1, "fault");

        assert_entry_identity(&snapshot, 2, "test/mixed-control");
        assert_eq!(snapshot.entry_status(2).as_deref(), Some("disabled"));
        assert_eq!(snapshot.entry_activation(2).as_deref(), Some("mixed"));
        assert_eq!(snapshot.entry_reason_code(2).as_deref(), Some("test/disabled-reason"));
        assert_value_contract(&snapshot, 2, "mixed", "test/branch-value");

        assert_entry_identity(&snapshot, 3, "test/unhandled-control");
        assert_unresolved_entry(&snapshot, 3, "unhandled");

        assert_entry_identity(&snapshot, 4, "test/unset-control");
        assert_eq!(snapshot.entry_status(4).as_deref(), Some("disabled"));
        assert_eq!(snapshot.entry_activation(4).as_deref(), Some("inactive"));
        assert_eq!(snapshot.entry_reason_code(4).as_deref(), Some("test/disabled-reason"));
        assert_value_contract(&snapshot, 4, "unset", "test/branch-value");
        Ok(())
    }

    struct BranchActionIds {
        blocked: ActionId,
        fault: ActionId,
        mixed: ActionId,
        unset: ActionId,
    }

    fn branch_action_registry(
        contract: &ActionStateValueContract,
        state_spec: &ActionStateSpec,
    ) -> Result<(ActionRegistry, BranchActionIds), Box<dyn Error>> {
        let blocked_action_id = ActionId::try_new("test/blocked-action")?;
        let fault_action_id = ActionId::try_new("test/fault-action")?;
        let mixed_action_id = ActionId::try_new("test/mixed-action")?;
        let unset_action_id = ActionId::try_new("test/unset-action")?;

        let blocked_reason = DisabledReason::new(
            QualifiedName::try_new("test/blocked-reason")?,
            Some(ActionValue::try_from_string("detail-stays-in-core")?),
        );
        let disabled_reason =
            DisabledReason::new(QualifiedName::try_new("test/disabled-reason")?, None);
        let registrations = vec![
            ActionRegistration::without_input(
                blocked_action_id.clone(),
                AbiFixtureAction::disabled(
                    blocked_reason,
                    ActionStateIndicator::new(
                        ActionActivation::Inactive,
                        ActionStateValue::unset(contract.clone()),
                    ),
                ),
            )
            .with_state_spec(state_spec.clone()),
            ActionRegistration::without_input(
                fault_action_id.clone(),
                AbiFixtureAction::fault(ActionFault::new(
                    QualifiedName::try_new("test/fixture-fault")?,
                    Some(ActionValue::try_from_string("fault-detail-stays-in-core")?),
                )),
            )
            .with_state_spec(state_spec.clone()),
            ActionRegistration::without_input(
                mixed_action_id.clone(),
                AbiFixtureAction::disabled(
                    disabled_reason.clone(),
                    ActionStateIndicator::new(
                        ActionActivation::Mixed,
                        ActionStateValue::mixed(contract.clone()),
                    ),
                ),
            )
            .with_state_spec(state_spec.clone()),
            ActionRegistration::without_input(
                unset_action_id.clone(),
                AbiFixtureAction::disabled(
                    disabled_reason,
                    ActionStateIndicator::new(
                        ActionActivation::Inactive,
                        ActionStateValue::unset(contract.clone()),
                    ),
                ),
            )
            .with_state_spec(state_spec.clone()),
        ];
        let registry = ActionRegistry::try_new(registrations)?;
        Ok((
            registry,
            BranchActionIds {
                blocked: blocked_action_id,
                fault: fault_action_id,
                mixed: mixed_action_id,
                unset: unset_action_id,
            },
        ))
    }

    fn branch_catalog() -> Result<ActionStateCatalog, Box<dyn Error>> {
        let contract = ActionStateValueContract::new(
            QualifiedName::try_new("test/branch-value")?,
            ActionStateValueVersion::one(),
        );
        let state_spec = ActionStateSpec::new(
            ActionStateContract::new(ActionActivationContract::Tracked, Some(contract.clone())),
            ActionEffects::conservative(),
        );
        let (registry, action_ids) = branch_action_registry(&contract, &state_spec)?;
        let blocked_intent_id = IntentId::try_new("test/blocked-intent")?;
        let unhandled_intent_id = IntentId::try_new("test/unhandled-intent")?;
        let router = IntentRouter::try_new(
            registry,
            vec![
                IntentDeclaration::without_input(blocked_intent_id.clone())
                    .with_state_spec(state_spec),
                IntentDeclaration::without_input(unhandled_intent_id.clone()),
            ],
            vec![IntentBinding::new(
                BindingId::try_new("test/blocked-binding")?,
                blocked_intent_id.clone(),
                action_ids.blocked,
                BindingPriority::new(0),
                DisabledRouting::Block,
            )],
        )?;
        ActionStateCatalog::try_new_with_router(
            router,
            vec![
                ActionStateRegistration::new(
                    ActionStateId::try_new("test/blocked-control")?,
                    ActionStateSource::routed(IntentInvocation::without_input(blocked_intent_id)),
                ),
                ActionStateRegistration::new(
                    ActionStateId::try_new("test/fault-control")?,
                    ActionStateSource::direct(ActionInvocation::without_input(action_ids.fault)),
                ),
                ActionStateRegistration::new(
                    ActionStateId::try_new("test/mixed-control")?,
                    ActionStateSource::direct(ActionInvocation::without_input(action_ids.mixed)),
                ),
                ActionStateRegistration::new(
                    ActionStateId::try_new("test/unhandled-control")?,
                    ActionStateSource::routed(IntentInvocation::without_input(unhandled_intent_id)),
                ),
                ActionStateRegistration::new(
                    ActionStateId::try_new("test/unset-control")?,
                    ActionStateSource::direct(ActionInvocation::without_input(action_ids.unset)),
                ),
            ],
        )
        .map_err(Into::into)
    }

    fn branch_snapshot() -> Result<BreditorActionStateSnapshot, Box<dyn Error>> {
        let context = EditorContext::default();
        let document = DocumentJsonCodec::new(context.schema().clone())
            .with_limits(context.limits().clone())
            .decode(EMPTY_DOCUMENT_JSON)?;
        let state = EditorState::try_new(
            &context,
            LineageId::try_new("wasm-action-state-branches")?,
            document,
            None,
            None,
        )?;
        let mut cache = ActionStateCache::new(branch_catalog()?);
        let update = cache.refresh(&EditorSession::new(state))?;
        Ok(BreditorActionStateSnapshot::from_update(&update))
    }

    fn assert_entry_identity(snapshot: &BreditorActionStateSnapshot, index: u32, expected: &str) {
        assert_eq!(snapshot.entry_id(index).as_deref(), Some(expected));
    }

    fn assert_unresolved_entry(
        snapshot: &BreditorActionStateSnapshot,
        index: u32,
        expected_status: &str,
    ) {
        assert_eq!(snapshot.entry_status(index).as_deref(), Some(expected_status));
        assert_eq!(snapshot.entry_activation(index), None);
        assert_eq!(snapshot.entry_reason_code(index), None);
        assert_eq!(snapshot.entry_value_status(index), None);
        assert_eq!(snapshot.entry_value_contract_name(index), None);
        assert_eq!(snapshot.entry_value_contract_version(index), None);
        assert_eq!(snapshot.entry_uniform_value_json(index).status(), "absent");
    }

    fn assert_value_contract(
        snapshot: &BreditorActionStateSnapshot,
        index: u32,
        expected_status: &str,
        expected_name: &str,
    ) {
        assert_eq!(snapshot.entry_value_status(index).as_deref(), Some(expected_status));
        assert_eq!(snapshot.entry_value_contract_name(index).as_deref(), Some(expected_name));
        assert_eq!(snapshot.entry_value_contract_version(index), Some(1));
        assert_eq!(snapshot.entry_uniform_value_json(index).status(), "absent");
    }
}

use crate::{
    action::{
        Action, ActionRegistration, ActionRegistry, ActionStateCatalog, ActionStateId,
        ActionStateRegistration, ActionStateSource,
        builtins::{
            ToggleInlineFormatAction, base_action_registrations, base_intent_bindings,
            base_intent_declarations, format_strong_intent_id,
        },
        routing::{
            BindingPriority, DisabledRouting, IntentBinding, IntentDeclaration, IntentInvocation,
            IntentRouter,
        },
    },
    extension::{ExtensionId, ExtensionSet, InlineFormatToggleSpecV1},
    identity::QualifiedName,
    schema::{CompiledSchema, SchemaId},
    transaction::ReplayDirection,
};

use super::{CompiledEditorProfile, ProfileCompilationError};

/// Maximum generated inline-format toggles in one compiled editor profile.
pub const MAX_PROFILE_INLINE_FORMAT_TOGGLES: u32 = 255;

pub(super) fn compile_base_text_profile(
    schema_id: SchemaId,
    extensions: ExtensionSet,
) -> Result<CompiledEditorProfile, ProfileCompilationError> {
    validate_toggle_count(&extensions)?;
    let schema = CompiledSchema::try_compile_base_text_profile(schema_id, &extensions)?;
    validate_toggle_targets(&extensions)?;
    validate_cross_owner_identities(&extensions)?;
    validate_reserved_identities(&extensions)?;

    let mut actions = base_action_registrations();
    let mut intents = base_intent_declarations();
    let mut bindings = base_intent_bindings();
    let mut action_states = base_action_state_registrations();
    for manifest in extensions.manifests() {
        for toggle in manifest.inline_format_toggles() {
            actions.push(ActionRegistration::new(
                toggle.action_id().clone(),
                ToggleInlineFormatAction::new(toggle.format_kind().clone()),
            ));
            intents.push(
                IntentDeclaration::new(toggle.intent_id().clone())
                    .with_state_spec(ToggleInlineFormatAction::state_spec()),
            );
            bindings.push(IntentBinding::new(
                toggle.binding_id().clone(),
                toggle.intent_id().clone(),
                toggle.action_id().clone(),
                BindingPriority::new(0),
                DisabledRouting::Block,
            ));
            action_states.push(ActionStateRegistration::new(
                toggle.action_state_id().clone(),
                ActionStateSource::routed(IntentInvocation::without_input(
                    toggle.intent_id().clone(),
                )),
            ));
        }
    }

    let actions = ActionRegistry::try_new(actions)?;
    let router = IntentRouter::try_new(actions, intents, bindings)?;
    let action_states = ActionStateCatalog::try_new_with_router(router.clone(), action_states)?;
    Ok(CompiledEditorProfile::from_compilation(extensions, schema, router, action_states))
}

pub(super) fn compile_breditor_base_profile()
-> Result<CompiledEditorProfile, ProfileCompilationError> {
    let extensions = ExtensionSet::empty();
    let schema = CompiledSchema::breditor_base();
    let actions = ActionRegistry::try_new(base_action_registrations())?;
    let router =
        IntentRouter::try_new(actions, base_intent_declarations(), base_intent_bindings())?;
    let action_states =
        ActionStateCatalog::try_new_with_router(router.clone(), base_action_state_registrations())?;
    Ok(CompiledEditorProfile::from_compilation(extensions, schema, router, action_states))
}

fn validate_toggle_count(extensions: &ExtensionSet) -> Result<(), ProfileCompilationError> {
    let actual = extensions.manifests().fold(0_u32, |total, manifest| {
        total.saturating_add(fixed_count(manifest.inline_format_toggles().len()))
    });
    if actual > MAX_PROFILE_INLINE_FORMAT_TOGGLES {
        return Err(ProfileCompilationError::TooManyInlineFormatToggles {
            actual,
            maximum: MAX_PROFILE_INLINE_FORMAT_TOGGLES,
        });
    }
    Ok(())
}

fn validate_toggle_targets(extensions: &ExtensionSet) -> Result<(), ProfileCompilationError> {
    let mut declarations = extensions
        .manifests()
        .flat_map(|manifest| {
            manifest.inline_format_toggles().iter().map(move |toggle| {
                (
                    toggle.format_kind().clone(),
                    manifest.id().clone(),
                    manifest.inline_formats(),
                    manifest.inline_format_property_contracts(),
                )
            })
        })
        .collect::<Vec<_>>();
    declarations.sort_by(|left, right| left.0.cmp(&right.0).then_with(|| left.1.cmp(&right.1)));
    for (format_kind, owner, owned_formats, property_contracts) in declarations {
        if !owned_formats.iter().any(|format| format.kind() == &format_kind) {
            return Err(ProfileCompilationError::InlineFormatToggleTargetNotOwned {
                owner,
                format_kind,
            });
        }
        if property_contracts
            .binary_search_by(|contract| contract.format_kind().cmp(&format_kind))
            .is_ok()
        {
            return Err(ProfileCompilationError::InlineFormatToggleTargetHasProperties {
                owner,
                format_kind,
            });
        }
    }
    Ok(())
}

fn validate_cross_owner_identities(
    extensions: &ExtensionSet,
) -> Result<(), ProfileCompilationError> {
    validate_action_id_ownership(extensions)?;
    validate_intent_id_ownership(extensions)?;
    validate_binding_id_ownership(extensions)?;
    validate_action_state_id_ownership(extensions)
}

fn validate_action_id_ownership(extensions: &ExtensionSet) -> Result<(), ProfileCompilationError> {
    let mut claims = toggle_claims(extensions, |toggle| toggle.action_id().clone());
    claims.sort();
    if let Some(pair) = claims.windows(2).find(|pair| pair[0].0 == pair[1].0) {
        return Err(ProfileCompilationError::DuplicateActionId {
            action_id: pair[0].0.clone(),
            first_owner: pair[0].1.clone(),
            second_owner: pair[1].1.clone(),
        });
    }
    Ok(())
}

fn validate_intent_id_ownership(extensions: &ExtensionSet) -> Result<(), ProfileCompilationError> {
    let mut claims = toggle_claims(extensions, |toggle| toggle.intent_id().clone());
    claims.sort();
    if let Some(pair) = claims.windows(2).find(|pair| pair[0].0 == pair[1].0) {
        return Err(ProfileCompilationError::DuplicateIntentId {
            intent_id: pair[0].0.clone(),
            first_owner: pair[0].1.clone(),
            second_owner: pair[1].1.clone(),
        });
    }
    Ok(())
}

fn validate_binding_id_ownership(extensions: &ExtensionSet) -> Result<(), ProfileCompilationError> {
    let mut claims = toggle_claims(extensions, |toggle| toggle.binding_id().clone());
    claims.sort();
    if let Some(pair) = claims.windows(2).find(|pair| pair[0].0 == pair[1].0) {
        return Err(ProfileCompilationError::DuplicateBindingId {
            binding_id: pair[0].0.clone(),
            first_owner: pair[0].1.clone(),
            second_owner: pair[1].1.clone(),
        });
    }
    Ok(())
}

fn validate_action_state_id_ownership(
    extensions: &ExtensionSet,
) -> Result<(), ProfileCompilationError> {
    let mut claims = toggle_claims(extensions, |toggle| toggle.action_state_id().clone());
    claims.sort();
    if let Some(pair) = claims.windows(2).find(|pair| pair[0].0 == pair[1].0) {
        return Err(ProfileCompilationError::DuplicateActionStateId {
            action_state_id: pair[0].0.clone(),
            first_owner: pair[0].1.clone(),
            second_owner: pair[1].1.clone(),
        });
    }
    Ok(())
}

fn toggle_claims<T: Ord>(
    extensions: &ExtensionSet,
    identity: impl Fn(&InlineFormatToggleSpecV1) -> T,
) -> Vec<(T, ExtensionId)> {
    extensions
        .manifests()
        .flat_map(|manifest| {
            let identity = &identity;
            manifest
                .inline_format_toggles()
                .iter()
                .map(move |toggle| (identity(toggle), manifest.id().clone()))
        })
        .collect()
}

fn validate_reserved_identities(extensions: &ExtensionSet) -> Result<(), ProfileCompilationError> {
    validate_reserved_action_ids(extensions)?;
    validate_reserved_intent_ids(extensions)?;
    validate_reserved_binding_ids(extensions)?;
    validate_reserved_action_state_ids(extensions)
}

fn validate_reserved_action_ids(extensions: &ExtensionSet) -> Result<(), ProfileCompilationError> {
    let mut claims = toggle_claims(extensions, |toggle| toggle.action_id().clone());
    claims.sort();
    if let Some((action_id, owner)) =
        claims.into_iter().find(|(id, _)| is_reserved(id.qualified_name()))
    {
        return Err(ProfileCompilationError::ReservedActionId { action_id, owner });
    }
    Ok(())
}

fn validate_reserved_intent_ids(extensions: &ExtensionSet) -> Result<(), ProfileCompilationError> {
    let mut claims = toggle_claims(extensions, |toggle| toggle.intent_id().clone());
    claims.sort();
    if let Some((intent_id, owner)) =
        claims.into_iter().find(|(id, _)| is_reserved(id.qualified_name()))
    {
        return Err(ProfileCompilationError::ReservedIntentId { intent_id, owner });
    }
    Ok(())
}

fn validate_reserved_binding_ids(extensions: &ExtensionSet) -> Result<(), ProfileCompilationError> {
    let mut claims = toggle_claims(extensions, |toggle| toggle.binding_id().clone());
    claims.sort();
    if let Some((binding_id, owner)) =
        claims.into_iter().find(|(id, _)| is_reserved(id.qualified_name()))
    {
        return Err(ProfileCompilationError::ReservedBindingId { binding_id, owner });
    }
    Ok(())
}

fn validate_reserved_action_state_ids(
    extensions: &ExtensionSet,
) -> Result<(), ProfileCompilationError> {
    let mut claims = toggle_claims(extensions, |toggle| toggle.action_state_id().clone());
    claims.sort();
    if let Some((action_state_id, owner)) =
        claims.into_iter().find(|(id, _)| is_reserved(id.qualified_name()))
    {
        return Err(ProfileCompilationError::ReservedActionStateId { action_state_id, owner });
    }
    Ok(())
}

fn base_action_state_registrations() -> Vec<ActionStateRegistration> {
    vec![
        ActionStateRegistration::new(
            ActionStateId::from_qualified_name(QualifiedName::from_known_static(
                "breditor/control-bold",
            )),
            ActionStateSource::routed(IntentInvocation::without_input(format_strong_intent_id())),
        ),
        ActionStateRegistration::new(
            ActionStateId::from_qualified_name(QualifiedName::from_known_static(
                "breditor/control-undo",
            )),
            ActionStateSource::history(ReplayDirection::Undo),
        ),
        ActionStateRegistration::new(
            ActionStateId::from_qualified_name(QualifiedName::from_known_static(
                "breditor/control-redo",
            )),
            ActionStateSource::history(ReplayDirection::Redo),
        ),
    ]
}

fn is_reserved(name: &QualifiedName) -> bool {
    name.namespace() == "breditor"
}

fn fixed_count(value: usize) -> u32 {
    u32::try_from(value).unwrap_or(u32::MAX)
}

#[cfg(test)]
mod tests {
    use std::error::Error;

    use crate::{
        action::{
            ActionActivationContract, ActionId, ActionStateDescriptor, ActionStateId,
            ActionStateSource,
            builtins::{
                FORMAT_STRONG_BINDING_NAME, FORMAT_STRONG_BINDING_PRIORITY,
                FORMAT_STRONG_INTENT_NAME, format_strong_binding_id, toggle_strong_action_id,
            },
            routing::{BindingId, DisabledRouting, IntentId},
        },
        extension::{
            ExtensionLimits, ExtensionManifest, ExtensionVersion, InlineFormatSpecV1,
            InlineFormatToggleSpecV1,
        },
        schema::{PersistedTypeRevision, SchemaCompilationError, SchemaVersion},
    };

    use super::*;

    type TestResult = Result<(), Box<dyn Error>>;

    fn name(value: &str) -> Result<QualifiedName, Box<dyn Error>> {
        QualifiedName::try_new(value).map_err(Into::into)
    }

    fn extension_id(value: &str) -> Result<ExtensionId, Box<dyn Error>> {
        Ok(ExtensionId::new(name(value)?, ExtensionVersion::one()))
    }

    fn schema_id(value: &str) -> Result<SchemaId, Box<dyn Error>> {
        Ok(SchemaId::new(name(value)?, SchemaVersion::try_new(1)?))
    }

    fn format(value: &str) -> Result<InlineFormatSpecV1, Box<dyn Error>> {
        Ok(InlineFormatSpecV1::new(name(value)?, PersistedTypeRevision::one()))
    }

    fn toggle(
        format_kind: &str,
        action_id: &str,
        intent_id: &str,
        binding_id: &str,
        action_state_id: &str,
    ) -> Result<InlineFormatToggleSpecV1, Box<dyn Error>> {
        Ok(InlineFormatToggleSpecV1::new(
            name(format_kind)?,
            ActionId::try_new(action_id)?,
            IntentId::try_new(intent_id)?,
            BindingId::try_new(binding_id)?,
            ActionStateId::try_new(action_state_id)?,
        ))
    }

    fn manifest(
        owner: &str,
        formats: Vec<InlineFormatSpecV1>,
        toggles: Vec<InlineFormatToggleSpecV1>,
    ) -> Result<ExtensionManifest, Box<dyn Error>> {
        Ok(ExtensionManifest::try_new_with_inline_formats_and_toggles(
            extension_id(owner)?,
            Vec::new(),
            Vec::new(),
            formats,
            toggles,
        )?)
    }

    fn extension_set(manifests: Vec<ExtensionManifest>) -> Result<ExtensionSet, Box<dyn Error>> {
        ExtensionSet::try_new(manifests, ExtensionLimits::default()).map_err(Into::into)
    }

    fn test_error(message: &'static str) -> std::io::Error {
        std::io::Error::other(message)
    }

    fn assert_duplicate_is_deterministic(
        alpha_toggle: InlineFormatToggleSpecV1,
        beta_toggle: InlineFormatToggleSpecV1,
        expected: &ProfileCompilationError,
    ) -> TestResult {
        let alpha =
            manifest("example/alpha", vec![format("example/alpha-format")?], vec![alpha_toggle])?;
        let beta =
            manifest("example/beta", vec![format("example/beta-format")?], vec![beta_toggle])?;
        for manifests in [vec![alpha.clone(), beta.clone()], vec![beta, alpha]] {
            assert_eq!(
                CompiledEditorProfile::try_compile_base_text_profile(
                    schema_id("example/duplicate-profile")?,
                    extension_set(manifests)?,
                )
                .err(),
                Some(expected.clone())
            );
        }
        Ok(())
    }

    #[test]
    fn empty_extension_profile_includes_the_complete_builtin_strong_route() -> TestResult {
        let profile = CompiledEditorProfile::try_compile_base_text_profile(
            schema_id("example/empty-profile")?,
            extension_set(Vec::new())?,
        )?;

        assert_eq!(profile.action_registry().len(), base_action_registrations().len());
        assert_eq!(profile.intent_router().intent_count(), 1);
        assert_eq!(profile.intent_router().binding_count(), 1);
        assert_eq!(profile.action_state_catalog().len(), 3);

        let strong_intent = format_strong_intent_id();
        let declaration = profile
            .intent_router()
            .declaration(&strong_intent)
            .ok_or_else(|| test_error("built-in strong intent is missing"))?;
        assert_eq!(declaration.id().as_str(), FORMAT_STRONG_INTENT_NAME);
        assert!(declaration.input_contract().is_none());
        assert_eq!(
            declaration.state_spec().contract().activation_contract(),
            ActionActivationContract::Tracked,
        );
        let binding = profile
            .intent_router()
            .binding(&format_strong_binding_id())
            .ok_or_else(|| test_error("built-in strong binding is missing"))?;
        assert_eq!(binding.id().as_str(), FORMAT_STRONG_BINDING_NAME);
        assert_eq!(binding.intent_id(), &strong_intent);
        assert_eq!(binding.action_id(), &toggle_strong_action_id());
        assert_eq!(binding.priority(), FORMAT_STRONG_BINDING_PRIORITY);
        assert_eq!(binding.disabled_routing(), DisabledRouting::Block);

        let bold = ActionStateId::try_new("breditor/control-bold")?;
        let undo = ActionStateId::try_new("breditor/control-undo")?;
        let redo = ActionStateId::try_new("breditor/control-redo")?;
        assert!(matches!(
            profile.action_state_catalog().descriptor(&bold).map(ActionStateDescriptor::source),
            Some(ActionStateSource::Routed(invocation))
                if invocation.id() == &strong_intent
        ));
        assert!(matches!(
            profile.action_state_catalog().descriptor(&undo).map(ActionStateDescriptor::source),
            Some(ActionStateSource::History(ReplayDirection::Undo))
        ));
        assert!(matches!(
            profile.action_state_catalog().descriptor(&redo).map(ActionStateDescriptor::source),
            Some(ActionStateSource::History(ReplayDirection::Redo))
        ));
        Ok(())
    }

    #[test]
    fn one_toggle_compiles_the_complete_tracked_routed_surface() -> TestResult {
        let format_kind = "example/highlight";
        let action_id = ActionId::try_new("example/toggle-highlight")?;
        let intent_id = IntentId::try_new("example/format-highlight")?;
        let binding_id = BindingId::try_new("example/highlight-binding")?;
        let action_state_id = ActionStateId::try_new("example/highlight-state")?;
        let extensions = extension_set(vec![manifest(
            "example/marks",
            vec![format(format_kind)?],
            vec![InlineFormatToggleSpecV1::new(
                name(format_kind)?,
                action_id.clone(),
                intent_id.clone(),
                binding_id.clone(),
                action_state_id.clone(),
            )],
        )?])?;
        let retained_extensions = extensions.clone();

        let profile = CompiledEditorProfile::try_compile_base_text_profile(
            schema_id("example/highlight-profile")?,
            extensions,
        )?;

        assert_eq!(profile.extensions(), &retained_extensions);
        assert!(profile.schema().is_property_free_inline_format(&name(format_kind)?));
        let action = profile
            .action_registry()
            .descriptor(&action_id)
            .ok_or_else(|| test_error("generated action is missing"))?;
        assert!(action.input_contract().is_none());
        assert_eq!(
            action.state_spec().contract().activation_contract(),
            ActionActivationContract::Tracked
        );
        let intent = profile
            .intent_router()
            .declaration(&intent_id)
            .ok_or_else(|| test_error("generated intent is missing"))?;
        assert!(intent.input_contract().is_none());
        assert_eq!(intent.state_spec(), action.state_spec());
        let binding = profile
            .intent_router()
            .binding(&binding_id)
            .ok_or_else(|| test_error("generated binding is missing"))?;
        assert_eq!(binding.intent_id(), &intent_id);
        assert_eq!(binding.action_id(), &action_id);
        assert_eq!(binding.priority(), BindingPriority::new(0));
        assert_eq!(binding.disabled_routing(), DisabledRouting::Block);
        assert!(matches!(
            profile
                .action_state_catalog()
                .descriptor(&action_state_id)
                .map(ActionStateDescriptor::source),
            Some(ActionStateSource::Routed(invocation)) if invocation.id() == &intent_id
        ));
        assert_eq!(profile.action_state_catalog().len(), 4);
        assert_eq!(profile.intent_router().intent_count(), 2);
        assert_eq!(profile.intent_router().binding_count(), 2);
        Ok(())
    }

    #[test]
    fn independent_equal_compilations_mint_distinct_profile_generations() -> TestResult {
        let compile = || -> Result<CompiledEditorProfile, Box<dyn Error>> {
            Ok(CompiledEditorProfile::try_compile_base_text_profile(
                schema_id("example/generation-profile")?,
                extension_set(Vec::new())?,
            )?)
        };
        let first = compile()?;
        let cloned = first.clone();
        let second = compile()?;

        assert_eq!(first.generation(), cloned.generation());
        assert_ne!(first.generation(), second.generation());
        assert_eq!(first.schema(), second.schema());
        Ok(())
    }

    #[test]
    fn a_format_without_a_toggle_is_an_admitted_schema_only_contribution() -> TestResult {
        let format_kind = name("example/schema-only-format")?;
        let profile = CompiledEditorProfile::try_compile_base_text_profile(
            schema_id("example/schema-only-profile")?,
            extension_set(vec![manifest(
                "example/schema-only-owner",
                vec![InlineFormatSpecV1::new(format_kind.clone(), PersistedTypeRevision::one())],
                Vec::new(),
            )?])?,
        )?;

        assert!(profile.schema().is_property_free_inline_format(&format_kind));
        assert_eq!(profile.intent_router().intent_count(), 1);
        assert_eq!(profile.intent_router().binding_count(), 1);
        assert_eq!(profile.action_state_catalog().len(), 3);
        assert_eq!(profile.action_registry().len(), base_action_registrations().len());
        Ok(())
    }

    #[test]
    fn exact_aggregate_toggle_limit_compiles() -> TestResult {
        let formats = (0..MAX_PROFILE_INLINE_FORMAT_TOGGLES)
            .map(|index| format(&format!("example/format-{index}")))
            .collect::<Result<Vec<_>, _>>()?;
        let toggles = (0..MAX_PROFILE_INLINE_FORMAT_TOGGLES)
            .map(|index| {
                toggle(
                    &format!("example/format-{index}"),
                    &format!("example/action-{index}"),
                    &format!("example/intent-{index}"),
                    &format!("example/binding-{index}"),
                    &format!("example/state-{index}"),
                )
            })
            .collect::<Result<Vec<_>, _>>()?;
        let profile = CompiledEditorProfile::try_compile_base_text_profile(
            schema_id("example/exact-toggle-limit")?,
            extension_set(vec![manifest("example/exact-owner", formats, toggles)?])?,
        )?;

        assert_eq!(
            profile.intent_router().intent_count(),
            usize::try_from(MAX_PROFILE_INLINE_FORMAT_TOGGLES)? + 1
        );
        assert_eq!(
            profile.intent_router().binding_count(),
            usize::try_from(MAX_PROFILE_INLINE_FORMAT_TOGGLES)? + 1
        );
        assert_eq!(
            profile.action_state_catalog().len(),
            usize::try_from(MAX_PROFILE_INLINE_FORMAT_TOGGLES)? + 3
        );
        Ok(())
    }

    #[test]
    fn aggregate_toggle_limit_precedes_schema_compilation() -> TestResult {
        let manifests = (0..=MAX_PROFILE_INLINE_FORMAT_TOGGLES)
            .map(|index| {
                manifest(
                    &format!("example/owner-{index}"),
                    Vec::new(),
                    vec![toggle(
                        &format!("example/format-{index}"),
                        &format!("example/action-{index}"),
                        &format!("example/intent-{index}"),
                        &format!("example/binding-{index}"),
                        &format!("example/state-{index}"),
                    )?],
                )
            })
            .collect::<Result<Vec<_>, _>>()?;
        let error = CompiledEditorProfile::try_compile_base_text_profile(
            schema_id("breditor/reserved-too")?,
            extension_set(manifests)?,
        );

        assert_eq!(
            error.err(),
            Some(ProfileCompilationError::TooManyInlineFormatToggles {
                actual: MAX_PROFILE_INLINE_FORMAT_TOGGLES + 1,
                maximum: MAX_PROFILE_INLINE_FORMAT_TOGGLES,
            })
        );
        Ok(())
    }

    #[test]
    fn schema_failures_are_retained_after_the_aggregate_gate() -> TestResult {
        let reserved = name("breditor/reserved-profile")?;
        let error = CompiledEditorProfile::try_compile_base_text_profile(
            SchemaId::new(reserved.clone(), SchemaVersion::try_new(1)?),
            extension_set(Vec::new())?,
        );

        assert_eq!(
            error.err(),
            Some(ProfileCompilationError::Schema {
                source: SchemaCompilationError::ReservedSchemaName { name: reserved },
            })
        );
        Ok(())
    }

    #[test]
    fn toggle_target_must_be_owned_by_its_containing_manifest() -> TestResult {
        let shared_kind = "example/shared-format";
        let owner = manifest("example/format-owner", vec![format(shared_kind)?], Vec::new())?;
        let borrower = manifest(
            "example/borrower",
            Vec::new(),
            vec![toggle(
                shared_kind,
                "example/borrow-action",
                "example/borrow-intent",
                "example/borrow-binding",
                "example/borrow-state",
            )?],
        )?;
        let borrower_id = borrower.id().clone();

        assert_eq!(
            CompiledEditorProfile::try_compile_base_text_profile(
                schema_id("example/borrow-profile")?,
                extension_set(vec![owner, borrower])?,
            )
            .err(),
            Some(ProfileCompilationError::InlineFormatToggleTargetNotOwned {
                owner: borrower_id,
                format_kind: name(shared_kind)?,
            })
        );
        Ok(())
    }

    #[test]
    fn cross_owner_duplicate_action_ids_report_canonical_owners() -> TestResult {
        let alpha_id = extension_id("example/alpha")?;
        let beta_id = extension_id("example/beta")?;
        assert_duplicate_is_deterministic(
            toggle(
                "example/alpha-format",
                "example/shared-action",
                "example/alpha-intent",
                "example/alpha-binding",
                "example/alpha-state",
            )?,
            toggle(
                "example/beta-format",
                "example/shared-action",
                "example/beta-intent",
                "example/beta-binding",
                "example/beta-state",
            )?,
            &ProfileCompilationError::DuplicateActionId {
                action_id: ActionId::try_new("example/shared-action")?,
                first_owner: alpha_id,
                second_owner: beta_id,
            },
        )
    }

    #[test]
    fn cross_owner_duplicate_intent_ids_report_canonical_owners() -> TestResult {
        assert_duplicate_is_deterministic(
            toggle(
                "example/alpha-format",
                "example/alpha-action",
                "example/shared-intent",
                "example/alpha-binding",
                "example/alpha-state",
            )?,
            toggle(
                "example/beta-format",
                "example/beta-action",
                "example/shared-intent",
                "example/beta-binding",
                "example/beta-state",
            )?,
            &ProfileCompilationError::DuplicateIntentId {
                intent_id: IntentId::try_new("example/shared-intent")?,
                first_owner: extension_id("example/alpha")?,
                second_owner: extension_id("example/beta")?,
            },
        )
    }

    #[test]
    fn cross_owner_duplicate_binding_ids_report_canonical_owners() -> TestResult {
        assert_duplicate_is_deterministic(
            toggle(
                "example/alpha-format",
                "example/alpha-action",
                "example/alpha-intent",
                "example/shared-binding",
                "example/alpha-state",
            )?,
            toggle(
                "example/beta-format",
                "example/beta-action",
                "example/beta-intent",
                "example/shared-binding",
                "example/beta-state",
            )?,
            &ProfileCompilationError::DuplicateBindingId {
                binding_id: BindingId::try_new("example/shared-binding")?,
                first_owner: extension_id("example/alpha")?,
                second_owner: extension_id("example/beta")?,
            },
        )
    }

    #[test]
    fn cross_owner_duplicate_action_state_ids_report_canonical_owners() -> TestResult {
        assert_duplicate_is_deterministic(
            toggle(
                "example/alpha-format",
                "example/alpha-action",
                "example/alpha-intent",
                "example/alpha-binding",
                "example/shared-state",
            )?,
            toggle(
                "example/beta-format",
                "example/beta-action",
                "example/beta-intent",
                "example/beta-binding",
                "example/shared-state",
            )?,
            &ProfileCompilationError::DuplicateActionStateId {
                action_state_id: ActionStateId::try_new("example/shared-state")?,
                first_owner: extension_id("example/alpha")?,
                second_owner: extension_id("example/beta")?,
            },
        )
    }

    #[test]
    fn each_semantic_identity_namespace_reserves_breditor() -> TestResult {
        let cases = [
            (
                toggle(
                    "example/format",
                    "breditor/action",
                    "example/intent",
                    "example/binding",
                    "example/state",
                )?,
                "action",
            ),
            (
                toggle(
                    "example/format",
                    "example/action",
                    "breditor/intent",
                    "example/binding",
                    "example/state",
                )?,
                "intent",
            ),
            (
                toggle(
                    "example/format",
                    "example/action",
                    "example/intent",
                    "breditor/binding",
                    "example/state",
                )?,
                "binding",
            ),
            (
                toggle(
                    "example/format",
                    "example/action",
                    "example/intent",
                    "example/binding",
                    "breditor/state",
                )?,
                "state",
            ),
        ];

        for (toggle, expected_kind) in cases {
            let error = CompiledEditorProfile::try_compile_base_text_profile(
                schema_id("example/reserved-profile")?,
                extension_set(vec![manifest(
                    "example/owner",
                    vec![format("example/format")?],
                    vec![toggle],
                )?])?,
            );
            let actual_kind = match error {
                Err(ProfileCompilationError::ReservedActionId { .. }) => "action",
                Err(ProfileCompilationError::ReservedIntentId { .. }) => "intent",
                Err(ProfileCompilationError::ReservedBindingId { .. }) => "binding",
                Err(ProfileCompilationError::ReservedActionStateId { .. }) => "state",
                other => {
                    return Err(format!("unexpected reserved-identity result: {other:?}").into());
                }
            };
            assert_eq!(actual_kind, expected_kind);
        }
        Ok(())
    }
}

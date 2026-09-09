//! Black-box contracts for manifest-generated property-aware format setters.

mod support;

use std::error::Error;

use breditor_core::{
    action::{
        ActionActivation, ActionActivationContract, ActionId, ActionInput, ActionStateId,
        ActionStateOutcome, ActionStateSource, ActionValue, ObservedAvailability,
        builtins::set_inline_format_input_contract,
        routing::{
            BindingId, BindingPriority, DisabledRouting, IntentId, IntentInvocation,
            IntentRouteOutcome,
        },
    },
    codec::DocumentJsonCodecV2,
    document::Document,
    extension::{
        ExtensionId, ExtensionLimits, ExtensionManifest, ExtensionManifestError, ExtensionSet,
        ExtensionVersion, InlineFormatPropertyContractV1, InlineFormatPropertySpecV1,
        InlineFormatPropertyTypeV1, InlineFormatSetSpecV1, InlineFormatSpecV1,
        InlineFormatToggleSpecV1, MAX_EXTENSION_INLINE_FORMAT_SETS_PER_MANIFEST,
        PropertyPresenceV1,
    },
    identity::QualifiedName,
    position::{Affinity, Point},
    profile::{
        CompiledEditorProfile, CompiledProfileActionStateSource, MAX_PROFILE_INLINE_FORMAT_SETS,
        ProfileCompilationError,
    },
    schema::{DocumentLimits, PersistedTypeRevision, SchemaId, SchemaVersion},
    selection::{RangeSelection, Selection},
    session::EditorSession,
    state::{EditorState, LineageId},
};
use serde_json::json;
use support::{TestResult, path, test_error};

const LINK: &str = "example/link";
const HREF: &str = "example/href";
const ACTION: &str = "example/set-link";
const INTENT: &str = "example/set-link-intent";
const BINDING: &str = "example/set-link-binding";
const ACTION_STATE: &str = "example/link-presence";

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

fn contract(value: &str) -> Result<InlineFormatPropertyContractV1, Box<dyn Error>> {
    Ok(InlineFormatPropertyContractV1::try_new(
        name(value)?,
        vec![InlineFormatPropertySpecV1::new(
            name(HREF)?,
            PropertyPresenceV1::Required,
            InlineFormatPropertyTypeV1::try_string(1, 2_048)?,
        )],
    )?)
}

fn setter(
    format_kind: &str,
    action_id: &str,
    intent_id: &str,
    binding_id: &str,
    action_state_id: &str,
) -> Result<InlineFormatSetSpecV1, Box<dyn Error>> {
    Ok(InlineFormatSetSpecV1::new(
        name(format_kind)?,
        ActionId::try_new(action_id)?,
        IntentId::try_new(intent_id)?,
        BindingId::try_new(binding_id)?,
        ActionStateId::try_new(action_state_id)?,
    ))
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
    contracts: Vec<InlineFormatPropertyContractV1>,
    toggles: Vec<InlineFormatToggleSpecV1>,
    sets: Vec<InlineFormatSetSpecV1>,
) -> Result<ExtensionManifest, Box<dyn Error>> {
    ExtensionManifest::try_new_with_inline_format_declarations_and_sets(
        extension_id(owner)?,
        Vec::new(),
        Vec::new(),
        formats,
        contracts,
        toggles,
        sets,
    )
    .map_err(Into::into)
}

fn extension_set(manifests: Vec<ExtensionManifest>) -> Result<ExtensionSet, Box<dyn Error>> {
    ExtensionSet::try_new(manifests, ExtensionLimits::default()).map_err(Into::into)
}

fn numbered_sets(prefix: &str, count: u32) -> Result<Vec<InlineFormatSetSpecV1>, Box<dyn Error>> {
    (0..count)
        .map(|index| {
            setter(
                &format!("example/{prefix}-format-{index}"),
                &format!("example/{prefix}-action-{index}"),
                &format!("example/{prefix}-intent-{index}"),
                &format!("example/{prefix}-binding-{index}"),
                &format!("example/{prefix}-state-{index}"),
            )
        })
        .collect()
}

fn link_setter() -> Result<InlineFormatSetSpecV1, Box<dyn Error>> {
    setter(LINK, ACTION, INTENT, BINDING, ACTION_STATE)
}

fn typed_link_manifest(owner: &str) -> Result<ExtensionManifest, Box<dyn Error>> {
    manifest(owner, vec![format(LINK)?], vec![contract(LINK)?], Vec::new(), vec![link_setter()?])
}

fn set_href_input(href: &str) -> Result<ActionInput, Box<dyn Error>> {
    let property = ActionValue::try_object(vec![
        ("name".to_owned(), ActionValue::try_from_string(HREF)?),
        ("value".to_owned(), ActionValue::try_from_string(href)?),
    ])?;
    let value = ActionValue::try_object(vec![
        ("operation".to_owned(), ActionValue::try_from_string("set")?),
        ("properties".to_owned(), ActionValue::try_array(vec![property])?),
    ])?;
    Ok(ActionInput::typed(set_inline_format_input_contract(), value))
}

fn remove_input() -> Result<ActionInput, Box<dyn Error>> {
    let value = ActionValue::try_object(vec![(
        "operation".to_owned(),
        ActionValue::try_from_string("remove")?,
    )])?;
    Ok(ActionInput::typed(set_inline_format_input_contract(), value))
}

fn selected_text() -> Result<Selection, Box<dyn Error>> {
    let anchor =
        Point::Text { text_path: path(&[0, 0])?, utf16_offset: 0, affinity: Affinity::Before };
    let focus =
        Point::Text { text_path: path(&[0, 0])?, utf16_offset: 3, affinity: Affinity::After };
    Ok(RangeSelection::new(anchor, focus).into())
}

fn initial_state(profile: &CompiledEditorProfile) -> Result<EditorState, Box<dyn Error>> {
    let source = json!({
        "format": "breditor/document",
        "formatVersion": 2,
        "schema": {
            "name": profile.schema().id().name().as_str(),
            "version": profile.schema().id().version().get(),
        },
        "schemaFingerprint": profile.schema().fingerprint().to_string(),
        "root": {
            "kind": "element",
            "type": "breditor/document",
            "entityId": null,
            "properties": {},
            "children": [{
                "kind": "element",
                "type": "breditor/paragraph",
                "entityId": null,
                "properties": {},
                "children": [{"kind": "text", "text": "abc", "formats": []}],
            }],
        },
    })
    .to_string();
    let context = profile.editor_context(DocumentLimits::default());
    let document = DocumentJsonCodecV2::new(profile.schema().clone()).decode(&source)?;
    EditorState::try_new(
        &context,
        LineageId::try_new("set-profile-runtime")?,
        document,
        Some(selected_text()?),
        None,
    )
    .map_err(Into::into)
}

fn href(document: &Document) -> Result<Option<&str>, Box<dyn Error>> {
    let link = name(LINK)?;
    let href = name(HREF)?;
    let text = document
        .root()
        .as_element()
        .and_then(|root| root.children().get(0))
        .and_then(breditor_core::document::NodeRef::as_element)
        .and_then(|paragraph| paragraph.children().get(0))
        .and_then(breditor_core::document::NodeRef::as_text)
        .ok_or_else(|| test_error("profile test document lost its text leaf"))?;
    Ok(text
        .formats()
        .get(&link)
        .and_then(|format| format.properties().get(&href))
        .and_then(breditor_core::document::PropertyValue::as_string))
}

#[test]
fn set_spec_is_data_only_and_manifests_store_it_canonically() -> TestResult {
    let alpha = setter(
        "example/alpha",
        "example/alpha-action",
        "example/alpha-intent",
        "example/alpha-binding",
        "example/alpha-state",
    )?;
    let zeta = setter(
        "example/zeta",
        "example/zeta-action",
        "example/zeta-intent",
        "example/zeta-binding",
        "example/zeta-state",
    )?;
    assert_eq!(alpha.format_kind().as_str(), "example/alpha");
    assert_eq!(alpha.action_id().as_str(), "example/alpha-action");
    assert_eq!(alpha.intent_id().as_str(), "example/alpha-intent");
    assert_eq!(alpha.binding_id().as_str(), "example/alpha-binding");
    assert_eq!(alpha.action_state_id().as_str(), "example/alpha-state");

    let owner = extension_id("example/canonical-owner")?;
    let manifest = ExtensionManifest::try_new_with_inline_format_declarations_and_sets(
        owner.clone(),
        Vec::new(),
        Vec::new(),
        Vec::new(),
        Vec::new(),
        Vec::new(),
        vec![zeta, alpha.clone()],
    )?;
    assert_eq!(manifest.inline_format_sets()[0], alpha);
    assert_eq!(manifest.inline_format_sets()[1].format_kind().as_str(), "example/zeta");

    let old = ExtensionManifest::try_new_with_inline_format_declarations(
        owner,
        Vec::new(),
        Vec::new(),
        Vec::new(),
        Vec::new(),
        Vec::new(),
    )?;
    assert!(old.inline_format_sets().is_empty());
    Ok(())
}

#[test]
fn setter_identities_do_not_change_the_document_schema() -> TestResult {
    let profile_with_set = CompiledEditorProfile::try_compile_base_text_profile(
        schema_id("example/set-schema-identity")?,
        extension_set(vec![typed_link_manifest("example/set-schema-owner")?])?,
    )?;
    let profile_with_renamed_set = CompiledEditorProfile::try_compile_base_text_profile(
        schema_id("example/set-schema-identity")?,
        extension_set(vec![manifest(
            "example/renamed-set-schema-owner",
            vec![format(LINK)?],
            vec![contract(LINK)?],
            Vec::new(),
            vec![setter(
                LINK,
                "renamed/set-link",
                "renamed/set-link-intent",
                "renamed/set-link-binding",
                "renamed/link-presence",
            )?],
        )?])?,
    )?;
    let schema_only = CompiledEditorProfile::try_compile_base_text_profile(
        schema_id("example/set-schema-identity")?,
        extension_set(vec![manifest(
            "example/schema-only-owner",
            vec![format(LINK)?],
            vec![contract(LINK)?],
            Vec::new(),
            Vec::new(),
        )?])?,
    )?;

    assert_eq!(profile_with_set.schema(), profile_with_renamed_set.schema());
    assert_eq!(profile_with_set.schema(), schema_only.schema());
    assert_eq!(profile_with_set.schema().fingerprint(), schema_only.schema().fingerprint());
    assert_eq!(schema_only.intent_router().intent_count(), 1);
    assert_eq!(profile_with_set.intent_router().intent_count(), 2);
    Ok(())
}

#[test]
fn duplicate_set_targets_actions_and_intents_are_canonical() -> TestResult {
    let owner = extension_id("example/duplicate-set-owner")?;
    let cases = [
        (
            setter(
                "example/alpha",
                "example/action-a",
                "example/intent-a",
                "example/binding-a",
                "example/state-a",
            )?,
            setter(
                "example/alpha",
                "example/action-b",
                "example/intent-b",
                "example/binding-b",
                "example/state-b",
            )?,
            ExtensionManifestError::DuplicateInlineFormatSetTarget {
                extension: owner.clone(),
                kind: name("example/alpha")?,
            },
        ),
        (
            setter(
                "example/alpha",
                "example/shared-action",
                "example/intent-a",
                "example/binding-a",
                "example/state-a",
            )?,
            setter(
                "example/zeta",
                "example/shared-action",
                "example/intent-z",
                "example/binding-z",
                "example/state-z",
            )?,
            ExtensionManifestError::DuplicateInlineFormatSetActionId {
                extension: owner.clone(),
                action_id: ActionId::try_new("example/shared-action")?,
            },
        ),
        (
            setter(
                "example/alpha",
                "example/action-a",
                "example/shared-intent",
                "example/binding-a",
                "example/state-a",
            )?,
            setter(
                "example/zeta",
                "example/action-z",
                "example/shared-intent",
                "example/binding-z",
                "example/state-z",
            )?,
            ExtensionManifestError::DuplicateInlineFormatSetIntentId {
                extension: owner.clone(),
                intent_id: IntentId::try_new("example/shared-intent")?,
            },
        ),
    ];

    for (first, second, expected) in cases {
        assert_set_duplicate_is_order_independent(&owner, &first, &second, &expected);
    }
    Ok(())
}

#[test]
fn duplicate_set_bindings_and_states_are_canonical() -> TestResult {
    let owner = extension_id("example/duplicate-set-owner")?;
    let cases = [
        (
            setter(
                "example/alpha",
                "example/action-a",
                "example/intent-a",
                "example/shared-binding",
                "example/state-a",
            )?,
            setter(
                "example/zeta",
                "example/action-z",
                "example/intent-z",
                "example/shared-binding",
                "example/state-z",
            )?,
            ExtensionManifestError::DuplicateInlineFormatSetBindingId {
                extension: owner.clone(),
                binding_id: BindingId::try_new("example/shared-binding")?,
            },
        ),
        (
            setter(
                "example/alpha",
                "example/action-a",
                "example/intent-a",
                "example/binding-a",
                "example/shared-state",
            )?,
            setter(
                "example/zeta",
                "example/action-z",
                "example/intent-z",
                "example/binding-z",
                "example/shared-state",
            )?,
            ExtensionManifestError::DuplicateInlineFormatSetActionStateId {
                extension: owner.clone(),
                action_state_id: ActionStateId::try_new("example/shared-state")?,
            },
        ),
    ];

    for (first, second, expected) in cases {
        assert_set_duplicate_is_order_independent(&owner, &first, &second, &expected);
    }
    Ok(())
}

fn assert_set_duplicate_is_order_independent(
    owner: &ExtensionId,
    first: &InlineFormatSetSpecV1,
    second: &InlineFormatSetSpecV1,
    expected: &ExtensionManifestError,
) {
    for declarations in [vec![first.clone(), second.clone()], vec![second.clone(), first.clone()]] {
        let actual = ExtensionManifest::try_new_with_inline_format_declarations_and_sets(
            owner.clone(),
            Vec::new(),
            Vec::new(),
            Vec::new(),
            Vec::new(),
            Vec::new(),
            declarations,
        );
        assert_eq!(actual.err().as_ref(), Some(expected));
    }
}

#[test]
fn toggle_and_set_declarations_cannot_share_any_identity_namespace() -> TestResult {
    let owner = extension_id("example/cross-family-owner")?;
    let cases = [
        (
            toggle(
                "example/plain",
                "example/shared-action",
                "example/toggle-intent",
                "example/toggle-binding",
                "example/toggle-state",
            )?,
            setter(
                "example/typed",
                "example/shared-action",
                "example/set-intent",
                "example/set-binding",
                "example/set-state",
            )?,
            ExtensionManifestError::DuplicateInlineFormatActionId {
                extension: owner.clone(),
                action_id: ActionId::try_new("example/shared-action")?,
            },
        ),
        (
            toggle(
                "example/plain",
                "example/toggle-action",
                "example/shared-intent",
                "example/toggle-binding",
                "example/toggle-state",
            )?,
            setter(
                "example/typed",
                "example/set-action",
                "example/shared-intent",
                "example/set-binding",
                "example/set-state",
            )?,
            ExtensionManifestError::DuplicateInlineFormatIntentId {
                extension: owner.clone(),
                intent_id: IntentId::try_new("example/shared-intent")?,
            },
        ),
        (
            toggle(
                "example/plain",
                "example/toggle-action",
                "example/toggle-intent",
                "example/shared-binding",
                "example/toggle-state",
            )?,
            setter(
                "example/typed",
                "example/set-action",
                "example/set-intent",
                "example/shared-binding",
                "example/set-state",
            )?,
            ExtensionManifestError::DuplicateInlineFormatBindingId {
                extension: owner.clone(),
                binding_id: BindingId::try_new("example/shared-binding")?,
            },
        ),
        (
            toggle(
                "example/plain",
                "example/toggle-action",
                "example/toggle-intent",
                "example/toggle-binding",
                "example/shared-state",
            )?,
            setter(
                "example/typed",
                "example/set-action",
                "example/set-intent",
                "example/set-binding",
                "example/shared-state",
            )?,
            ExtensionManifestError::DuplicateInlineFormatActionStateId {
                extension: owner.clone(),
                action_state_id: ActionStateId::try_new("example/shared-state")?,
            },
        ),
    ];

    for (toggle, set, expected) in cases {
        let actual = ExtensionManifest::try_new_with_inline_format_declarations_and_sets(
            owner.clone(),
            Vec::new(),
            Vec::new(),
            Vec::new(),
            Vec::new(),
            vec![toggle],
            vec![set],
        );
        assert_eq!(actual.err(), Some(expected));
    }
    Ok(())
}

#[test]
fn cross_family_collision_selects_the_lexical_first_id_regardless_of_order() -> TestResult {
    let owner = extension_id("example/canonical-cross-family-owner")?;
    let alpha_toggle = toggle(
        "example/plain-alpha",
        "example/shared-alpha",
        "example/toggle-alpha-intent",
        "example/toggle-alpha-binding",
        "example/toggle-alpha-state",
    )?;
    let zeta_toggle = toggle(
        "example/plain-zeta",
        "example/shared-zeta",
        "example/toggle-zeta-intent",
        "example/toggle-zeta-binding",
        "example/toggle-zeta-state",
    )?;
    let alpha_set = setter(
        "example/typed-alpha",
        "example/shared-alpha",
        "example/set-alpha-intent",
        "example/set-alpha-binding",
        "example/set-alpha-state",
    )?;
    let zeta_set = setter(
        "example/typed-zeta",
        "example/shared-zeta",
        "example/set-zeta-intent",
        "example/set-zeta-binding",
        "example/set-zeta-state",
    )?;
    for (toggles, sets) in [
        (
            vec![zeta_toggle.clone(), alpha_toggle.clone()],
            vec![zeta_set.clone(), alpha_set.clone()],
        ),
        (
            vec![alpha_toggle.clone(), zeta_toggle.clone()],
            vec![alpha_set.clone(), zeta_set.clone()],
        ),
    ] {
        let actual = ExtensionManifest::try_new_with_inline_format_declarations_and_sets(
            owner.clone(),
            Vec::new(),
            Vec::new(),
            Vec::new(),
            Vec::new(),
            toggles,
            sets,
        );
        assert_eq!(
            actual.err(),
            Some(ExtensionManifestError::DuplicateInlineFormatActionId {
                extension: owner.clone(),
                action_id: ActionId::try_new("example/shared-alpha")?,
            })
        );
    }
    Ok(())
}

#[test]
fn manifest_set_limit_accepts_the_boundary_and_rejects_first_excess() -> TestResult {
    let owner = extension_id("example/set-limit-owner")?;
    let exact = ExtensionManifest::try_new_with_inline_format_declarations_and_sets(
        owner.clone(),
        Vec::new(),
        Vec::new(),
        Vec::new(),
        Vec::new(),
        Vec::new(),
        numbered_sets("exact-set", MAX_EXTENSION_INLINE_FORMAT_SETS_PER_MANIFEST)?,
    )?;
    assert_eq!(
        exact.inline_format_sets().len(),
        usize::try_from(MAX_EXTENSION_INLINE_FORMAT_SETS_PER_MANIFEST)?
    );

    let excess = ExtensionManifest::try_new_with_inline_format_declarations_and_sets(
        owner.clone(),
        Vec::new(),
        Vec::new(),
        Vec::new(),
        Vec::new(),
        Vec::new(),
        numbered_sets("excess-set", MAX_EXTENSION_INLINE_FORMAT_SETS_PER_MANIFEST + 1)?,
    );
    assert_eq!(
        excess.err(),
        Some(ExtensionManifestError::TooManyInlineFormatSets {
            extension: owner,
            actual: MAX_EXTENSION_INLINE_FORMAT_SETS_PER_MANIFEST + 1,
            maximum: MAX_EXTENSION_INLINE_FORMAT_SETS_PER_MANIFEST,
        })
    );
    Ok(())
}

#[test]
fn exact_profile_set_limit_compiles_and_aggregate_first_excess_precedes_schema() -> TestResult {
    let mut formats = Vec::new();
    let mut contracts = Vec::new();
    let mut sets = Vec::new();
    for index in 0..MAX_PROFILE_INLINE_FORMAT_SETS {
        let kind = format!("example/exact-profile-format-{index}");
        formats.push(format(&kind)?);
        contracts.push(contract(&kind)?);
        sets.push(setter(
            &kind,
            &format!("example/exact-profile-action-{index}"),
            &format!("example/exact-profile-intent-{index}"),
            &format!("example/exact-profile-binding-{index}"),
            &format!("example/exact-profile-state-{index}"),
        )?);
    }
    let profile = CompiledEditorProfile::try_compile_base_text_profile(
        schema_id("example/exact-set-profile")?,
        extension_set(vec![manifest(
            "example/exact-set-owner",
            formats,
            contracts,
            Vec::new(),
            sets,
        )?])?,
    )?;
    assert_eq!(
        profile.action_registry().len(),
        usize::try_from(MAX_PROFILE_INLINE_FORMAT_SETS)? + 7
    );
    assert_eq!(
        profile.intent_router().intent_count(),
        usize::try_from(MAX_PROFILE_INLINE_FORMAT_SETS)? + 1
    );
    assert_eq!(
        profile.action_state_catalog().len(),
        usize::try_from(MAX_PROFILE_INLINE_FORMAT_SETS)? + 3
    );

    let alpha = manifest(
        "example/aggregate-alpha",
        Vec::new(),
        Vec::new(),
        Vec::new(),
        numbered_sets("aggregate-alpha", 128)?,
    )?;
    let beta = manifest(
        "example/aggregate-beta",
        Vec::new(),
        Vec::new(),
        Vec::new(),
        numbered_sets("aggregate-beta", 128)?,
    )?;
    let excess = CompiledEditorProfile::try_compile_base_text_profile(
        SchemaId::new(name("breditor/reserved-set-profile")?, SchemaVersion::try_new(1)?),
        extension_set(vec![beta, alpha])?,
    );
    assert_eq!(
        excess.err(),
        Some(ProfileCompilationError::TooManyInlineFormatSets {
            actual: MAX_PROFILE_INLINE_FORMAT_SETS + 1,
            maximum: MAX_PROFILE_INLINE_FORMAT_SETS,
        })
    );
    Ok(())
}

#[test]
fn setter_target_must_be_owned_and_typed_by_its_containing_manifest() -> TestResult {
    let format_owner = manifest(
        "example/typed-format-owner",
        vec![format(LINK)?],
        vec![contract(LINK)?],
        Vec::new(),
        Vec::new(),
    )?;
    let borrower =
        manifest("example/set-borrower", Vec::new(), Vec::new(), Vec::new(), vec![link_setter()?])?;
    let borrower_id = borrower.id().clone();
    let not_owned = CompiledEditorProfile::try_compile_base_text_profile(
        schema_id("example/not-owned-set-profile")?,
        extension_set(vec![borrower, format_owner])?,
    );
    assert_eq!(
        not_owned.err(),
        Some(ProfileCompilationError::InlineFormatSetTargetNotOwned {
            owner: borrower_id,
            format_kind: name(LINK)?,
        })
    );

    let property_free = manifest(
        "example/property-free-set-owner",
        vec![format(LINK)?],
        Vec::new(),
        Vec::new(),
        vec![link_setter()?],
    )?;
    let property_free_id = property_free.id().clone();
    let untyped = CompiledEditorProfile::try_compile_base_text_profile(
        schema_id("example/untyped-set-profile")?,
        extension_set(vec![property_free])?,
    );
    assert_eq!(
        untyped.err(),
        Some(ProfileCompilationError::InlineFormatSetTargetHasNoProperties {
            owner: property_free_id,
            format_kind: name(LINK)?,
        })
    );
    Ok(())
}

#[derive(Clone, Copy)]
enum IdentityKind {
    Action,
    Intent,
    Binding,
    State,
}

fn cross_owner_declarations(
    kind: IdentityKind,
) -> Result<(ExtensionManifest, ExtensionManifest, ProfileCompilationError), Box<dyn Error>> {
    let alpha_id = extension_id("example/identity-alpha")?;
    let beta_id = extension_id("example/identity-beta")?;
    let toggle = toggle(
        "example/plain-format",
        if matches!(kind, IdentityKind::Action) {
            "example/shared-action"
        } else {
            "example/alpha-action"
        },
        if matches!(kind, IdentityKind::Intent) {
            "example/shared-intent"
        } else {
            "example/alpha-intent"
        },
        if matches!(kind, IdentityKind::Binding) {
            "example/shared-binding"
        } else {
            "example/alpha-binding"
        },
        if matches!(kind, IdentityKind::State) {
            "example/shared-state"
        } else {
            "example/alpha-state"
        },
    )?;
    let set = setter(
        "example/typed-format",
        if matches!(kind, IdentityKind::Action) {
            "example/shared-action"
        } else {
            "example/beta-action"
        },
        if matches!(kind, IdentityKind::Intent) {
            "example/shared-intent"
        } else {
            "example/beta-intent"
        },
        if matches!(kind, IdentityKind::Binding) {
            "example/shared-binding"
        } else {
            "example/beta-binding"
        },
        if matches!(kind, IdentityKind::State) {
            "example/shared-state"
        } else {
            "example/beta-state"
        },
    )?;
    let alpha = manifest(
        alpha_id.name().as_str(),
        vec![format("example/plain-format")?],
        Vec::new(),
        vec![toggle],
        Vec::new(),
    )?;
    let beta = manifest(
        beta_id.name().as_str(),
        vec![format("example/typed-format")?],
        vec![contract("example/typed-format")?],
        Vec::new(),
        vec![set],
    )?;
    let error = match kind {
        IdentityKind::Action => ProfileCompilationError::DuplicateActionId {
            action_id: ActionId::try_new("example/shared-action")?,
            first_owner: alpha_id,
            second_owner: beta_id,
        },
        IdentityKind::Intent => ProfileCompilationError::DuplicateIntentId {
            intent_id: IntentId::try_new("example/shared-intent")?,
            first_owner: alpha_id,
            second_owner: beta_id,
        },
        IdentityKind::Binding => ProfileCompilationError::DuplicateBindingId {
            binding_id: BindingId::try_new("example/shared-binding")?,
            first_owner: alpha_id,
            second_owner: beta_id,
        },
        IdentityKind::State => ProfileCompilationError::DuplicateActionStateId {
            action_state_id: ActionStateId::try_new("example/shared-state")?,
            first_owner: alpha_id,
            second_owner: beta_id,
        },
    };
    Ok((alpha, beta, error))
}

#[test]
fn cross_owner_id_collisions_span_both_families_and_ignore_input_order() -> TestResult {
    for kind in
        [IdentityKind::Action, IdentityKind::Intent, IdentityKind::Binding, IdentityKind::State]
    {
        let (alpha, beta, expected) = cross_owner_declarations(kind)?;
        for manifests in [vec![alpha.clone(), beta.clone()], vec![beta.clone(), alpha.clone()]] {
            let result = CompiledEditorProfile::try_compile_base_text_profile(
                schema_id("example/cross-owner-profile")?,
                extension_set(manifests)?,
            );
            assert_eq!(result.err(), Some(expected.clone()));
        }
    }
    Ok(())
}

#[test]
fn every_set_identity_namespace_rejects_reserved_core_names() -> TestResult {
    let cases = [
        (setter(LINK, "breditor/extension-action", INTENT, BINDING, ACTION_STATE)?, "action"),
        (setter(LINK, ACTION, "breditor/extension-intent", BINDING, ACTION_STATE)?, "intent"),
        (setter(LINK, ACTION, INTENT, "breditor/extension-binding", ACTION_STATE)?, "binding"),
        (setter(LINK, ACTION, INTENT, BINDING, "breditor/extension-state")?, "state"),
    ];

    for (set, expected) in cases {
        let result = CompiledEditorProfile::try_compile_base_text_profile(
            schema_id("example/reserved-set-profile")?,
            extension_set(vec![manifest(
                "example/reserved-set-owner",
                vec![format(LINK)?],
                vec![contract(LINK)?],
                Vec::new(),
                vec![set],
            )?])?,
        );
        let actual = match result {
            Err(ProfileCompilationError::ReservedActionId { .. }) => "action",
            Err(ProfileCompilationError::ReservedIntentId { .. }) => "intent",
            Err(ProfileCompilationError::ReservedBindingId { .. }) => "binding",
            Err(ProfileCompilationError::ReservedActionStateId { .. }) => "state",
            other => {
                return Err(test_error(format!("unexpected reserved result: {other:?}")).into());
            }
        };
        assert_eq!(actual, expected);
    }
    Ok(())
}

fn observed_presence(
    profile: &CompiledEditorProfile,
    session: &EditorSession,
) -> Result<(ObservedAvailability, ActionActivation), Box<dyn Error>> {
    let batch = profile.action_state_catalog().derive(session)?;
    let entry = batch
        .entry(&ActionStateId::try_new(ACTION_STATE)?)
        .ok_or_else(|| test_error("generated set action state is missing"))?;
    let ActionStateOutcome::Resolved(resolved) = entry.outcome() else {
        return Err(test_error("generated set action state did not resolve").into());
    };
    Ok((resolved.availability().clone(), resolved.indicator().activation()))
}

#[test]
fn compiled_setter_has_a_fixed_presence_query_but_executes_dynamic_set_and_remove() -> TestResult {
    let profile = CompiledEditorProfile::try_compile_base_text_profile(
        schema_id("example/link-set-profile")?,
        extension_set(vec![typed_link_manifest("example/link-set-owner")?])?,
    )?;
    let action_id = ActionId::try_new(ACTION)?;
    let intent_id = IntentId::try_new(INTENT)?;
    let binding_id = BindingId::try_new(BINDING)?;
    let state_id = ActionStateId::try_new(ACTION_STATE)?;
    let input_contract = set_inline_format_input_contract();

    let action = profile
        .action_registry()
        .descriptor(&action_id)
        .ok_or_else(|| test_error("generated set action is missing"))?;
    assert_eq!(action.input_contract(), Some(&input_contract));
    let intent = profile
        .intent_router()
        .declaration(&intent_id)
        .ok_or_else(|| test_error("generated set intent is missing"))?;
    assert_eq!(intent.input_contract(), Some(&input_contract));
    assert_eq!(intent.state_spec(), action.state_spec());
    assert_eq!(
        intent.state_spec().contract().activation_contract(),
        ActionActivationContract::Tracked
    );
    let binding = profile
        .intent_router()
        .binding(&binding_id)
        .ok_or_else(|| test_error("generated set binding is missing"))?;
    assert_eq!(binding.intent_id(), &intent_id);
    assert_eq!(binding.action_id(), &action_id);
    assert_eq!(binding.priority(), BindingPriority::new(0));
    assert_eq!(binding.disabled_routing(), DisabledRouting::Block);

    let state_descriptor = profile
        .action_state_catalog()
        .descriptor(&state_id)
        .ok_or_else(|| test_error("generated set action-state descriptor is missing"))?;
    let ActionStateSource::Routed(presence_invocation) = state_descriptor.source() else {
        return Err(test_error("generated set state is not routed").into());
    };
    assert_eq!(presence_invocation.id(), &intent_id);
    let presence_value = presence_invocation.input().require_typed(&input_contract)?;
    let presence_object =
        presence_value.as_object().ok_or_else(|| test_error("presence input is not an object"))?;
    assert_eq!(presence_object.len(), 1);
    assert_eq!(presence_object.get("operation").and_then(ActionValue::as_string), Some("remove"));
    assert_ne!(presence_invocation.input(), &set_href_input("https://example.test")?);
    assert_eq!(
        profile.descriptor().intent(&intent_id).and_then(|descriptor| descriptor.input_contract()),
        Some(&input_contract)
    );
    assert!(matches!(
        profile
            .descriptor()
            .action_state(&state_id)
            .map(breditor_core::profile::CompiledProfileActionStateDescriptor::source),
        Some(CompiledProfileActionStateSource::Routed(intent)) if intent == &intent_id
    ));

    let mut session = EditorSession::new(initial_state(&profile)?);
    let (availability, activation) = observed_presence(&profile, &session)?;
    assert!(matches!(availability, ObservedAvailability::Blocked(_)));
    assert_eq!(activation, ActionActivation::Inactive);
    assert_eq!(href(session.state().document())?, None);

    let no_input = profile
        .intent_router()
        .route(session.state(), &IntentInvocation::without_input(intent_id.clone()));
    assert!(no_input.is_err());

    let set_invocation =
        IntentInvocation::new(intent_id.clone(), set_href_input("https://example.test")?);
    let set_route = profile.intent_router().route(session.state(), &set_invocation)?;
    assert!(matches!(set_route, IntentRouteOutcome::Prepared(_)));
    let set_receipt = session.execute_intent_route(set_route)?;
    assert!(set_receipt.commit().is_some());
    assert_eq!(href(session.state().document())?, Some("https://example.test"));
    assert_eq!(observed_presence(&profile, &session)?.1, ActionActivation::Active);

    session.undo()?.ok_or_else(|| test_error("generated set undo was unavailable"))?;
    assert_eq!(href(session.state().document())?, None);
    assert_eq!(observed_presence(&profile, &session)?.1, ActionActivation::Inactive);
    session.redo()?.ok_or_else(|| test_error("generated set redo was unavailable"))?;
    assert_eq!(href(session.state().document())?, Some("https://example.test"));

    let remove_invocation = IntentInvocation::new(intent_id, remove_input()?);
    let remove_route = profile.intent_router().route(session.state(), &remove_invocation)?;
    assert!(matches!(remove_route, IntentRouteOutcome::Prepared(_)));
    let remove_receipt = session.execute_intent_route(remove_route)?;
    assert!(remove_receipt.commit().is_some());
    assert_eq!(href(session.state().document())?, None);
    assert_eq!(observed_presence(&profile, &session)?.1, ActionActivation::Inactive);
    Ok(())
}

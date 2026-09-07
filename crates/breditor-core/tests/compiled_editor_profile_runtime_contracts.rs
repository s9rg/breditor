//! Black-box runtime contracts for manifest-compiled editor profiles.

mod support;

use std::error::Error;

use breditor_core::{
    action::{
        ActionActivation, ActionId, ActionStateId, ActionStateOutcome, ActionStateProvenance,
        ActionStateSource, ObservedAvailability,
        routing::{BindingId, DisabledRouting, IntentId, IntentInvocation, IntentRouteOutcome},
    },
    codec::DocumentJsonCodecV2,
    document::Document,
    extension::{
        ExtensionId, ExtensionLimits, ExtensionManifest, ExtensionSet, ExtensionVersion,
        InlineFormatSpecV1, InlineFormatToggleSpecV1,
    },
    identity::QualifiedName,
    position::{Affinity, Point},
    profile::CompiledEditorProfile,
    schema::{DocumentLimits, PersistedTypeRevision, SchemaId, SchemaVersion},
    selection::{RangeSelection, Selection},
    session::EditorSession,
    state::{EditorContext, EditorState, LineageId},
};
use serde_json::{Value, json};
use support::{TestResult, path, test_error};

const FORMAT: &str = "example/highlight";
const ACTION: &str = "example/toggle-highlight";
const INTENT: &str = "example/toggle-highlight-intent";
const BINDING: &str = "example/toggle-highlight-binding";
const ACTION_STATE: &str = "example/highlight-control";

fn name(value: &str) -> Result<QualifiedName, Box<dyn Error>> {
    QualifiedName::try_new(value).map_err(Into::into)
}

fn schema_id() -> Result<SchemaId, Box<dyn Error>> {
    Ok(SchemaId::new(name("example/runtime-profile")?, SchemaVersion::try_new(1)?))
}

fn toggle(
    format: &str,
    action: &str,
    intent: &str,
    binding: &str,
    state: &str,
) -> Result<InlineFormatToggleSpecV1, Box<dyn Error>> {
    Ok(InlineFormatToggleSpecV1::new(
        name(format)?,
        ActionId::try_new(action)?,
        IntentId::try_new(intent)?,
        BindingId::try_new(binding)?,
        ActionStateId::try_new(state)?,
    ))
}

fn extensions(
    owner: &str,
    version: u32,
    toggle: InlineFormatToggleSpecV1,
) -> Result<ExtensionSet, Box<dyn Error>> {
    extensions_with_toggles(owner, version, vec![toggle])
}

fn extensions_with_toggles(
    owner: &str,
    version: u32,
    toggles: Vec<InlineFormatToggleSpecV1>,
) -> Result<ExtensionSet, Box<dyn Error>> {
    let owner = ExtensionId::new(name(owner)?, ExtensionVersion::try_new(version)?);
    let manifest = ExtensionManifest::try_new_with_inline_formats_and_toggles(
        owner,
        Vec::new(),
        Vec::new(),
        vec![InlineFormatSpecV1::new(name(FORMAT)?, PersistedTypeRevision::try_new(1)?)],
        toggles,
    )?;
    ExtensionSet::try_new(vec![manifest], ExtensionLimits::default()).map_err(Into::into)
}

fn profile() -> Result<CompiledEditorProfile, Box<dyn Error>> {
    let extensions = extensions(
        "example/highlight-extension",
        1,
        toggle(FORMAT, ACTION, INTENT, BINDING, ACTION_STATE)?,
    )?;
    CompiledEditorProfile::try_compile_base_text_profile(schema_id()?, extensions)
        .map_err(Into::into)
}

fn paragraph(text: &str, formatted: bool) -> Value {
    let formats =
        if formatted { vec![json!({"type": FORMAT, "properties": {}})] } else { Vec::new() };
    json!({
        "kind": "element",
        "type": "breditor/paragraph",
        "entityId": null,
        "properties": {},
        "children": [{"kind": "text", "text": text, "formats": formats}],
    })
}

fn document_json(profile: &CompiledEditorProfile, paragraph: &Value) -> String {
    json!({
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
            "children": [paragraph],
        },
    })
    .to_string()
}

fn point(offset: u32, affinity: Affinity) -> Result<Point, Box<dyn Error>> {
    Ok(Point::Text { text_path: path(&[0, 0])?, utf16_offset: offset, affinity })
}

fn selected_text() -> Result<Selection, Box<dyn Error>> {
    Ok(RangeSelection::new(point(0, Affinity::Before)?, point(3, Affinity::After)?).into())
}

fn state(
    profile: &CompiledEditorProfile,
    formatted: bool,
    selection: Option<Selection>,
    lineage: &str,
) -> Result<EditorState, Box<dyn Error>> {
    let context = EditorContext::new(profile.schema().clone(), DocumentLimits::default());
    let document = DocumentJsonCodecV2::new(profile.schema().clone())
        .decode(&document_json(profile, &paragraph("abc", formatted)))?;
    EditorState::try_new(&context, LineageId::try_new(lineage)?, document, selection, None)
        .map_err(Into::into)
}

fn has_format(document: &Document, format: &QualifiedName) -> Result<bool, Box<dyn Error>> {
    let text = document
        .root()
        .as_element()
        .and_then(|root| root.children().get(0))
        .and_then(breditor_core::document::NodeRef::as_element)
        .and_then(|paragraph| paragraph.children().get(0))
        .and_then(breditor_core::document::NodeRef::as_text)
        .ok_or_else(|| test_error("profile test document lost its text leaf"))?;
    Ok(text.formats().get(format).is_some())
}

fn observed_activation(
    profile: &CompiledEditorProfile,
    session: &EditorSession,
) -> Result<ActionActivation, Box<dyn Error>> {
    let state_id = ActionStateId::try_new(ACTION_STATE)?;
    let batch = profile.action_state_catalog().derive(session)?;
    let entry = batch
        .entry(&state_id)
        .ok_or_else(|| test_error("generated profile action-state entry is missing"))?;
    let ActionStateOutcome::Resolved(resolved) = entry.outcome() else {
        return Err(test_error("generated profile action state did not resolve").into());
    };
    assert!(resolved.availability().is_enabled());
    assert!(matches!(
        resolved.provenance(),
        ActionStateProvenance::Routed { intent, binding, fallthroughs }
            if intent.as_str() == INTENT
                && binding.id().as_str() == BINDING
                && fallthroughs.is_empty()
    ));
    Ok(resolved.indicator().activation())
}

#[test]
fn compiled_profile_routes_observes_commits_and_replays_one_toggle() -> TestResult {
    let profile = profile()?;
    let action_id = ActionId::try_new(ACTION)?;
    let intent_id = IntentId::try_new(INTENT)?;
    let binding_id = BindingId::try_new(BINDING)?;
    let action_state_id = ActionStateId::try_new(ACTION_STATE)?;

    assert_eq!(profile.action_registry().len(), 8);
    assert_eq!(profile.intent_router().intent_count(), 1);
    assert_eq!(profile.intent_router().binding_count(), 1);
    assert_eq!(profile.action_state_catalog().len(), 4);
    let action = profile
        .action_registry()
        .descriptor(&action_id)
        .ok_or_else(|| test_error("generated action descriptor is missing"))?;
    assert!(action.input_contract().is_none());
    let binding = profile
        .intent_router()
        .binding(&binding_id)
        .ok_or_else(|| test_error("generated intent binding is missing"))?;
    assert_eq!(binding.disabled_routing(), DisabledRouting::Block);
    let descriptor = profile
        .action_state_catalog()
        .descriptor(&action_state_id)
        .ok_or_else(|| test_error("generated action-state descriptor is missing"))?;
    assert!(matches!(
        descriptor.source(),
        ActionStateSource::Routed(invocation) if invocation.id() == &intent_id
    ));

    let initial = state(&profile, false, Some(selected_text()?), "profile-runtime")?;
    let mut session = EditorSession::new(initial);
    assert_eq!(observed_activation(&profile, &session)?, ActionActivation::Inactive);

    let invocation = IntentInvocation::without_input(intent_id);
    let route = profile.intent_router().route(session.state(), &invocation)?;
    assert!(matches!(&route, IntentRouteOutcome::Prepared(_)));
    let receipt = session.execute_intent_route(route)?;
    let commit = receipt.commit().ok_or_else(|| test_error("toggle route did not commit"))?;
    assert_eq!(commit.metadata().action(), Some(action_id.qualified_name()));
    assert_eq!(commit.forward_operations().len(), 1);
    assert_eq!(session.undo_depth(), 1);
    assert!(has_format(session.state().document(), &name(FORMAT)?)?);
    assert_eq!(observed_activation(&profile, &session)?, ActionActivation::Active);

    session.undo()?.ok_or_else(|| test_error("toggle undo was unavailable"))?;
    assert!(!has_format(session.state().document(), &name(FORMAT)?)?);
    assert_eq!(observed_activation(&profile, &session)?, ActionActivation::Inactive);
    session.redo()?.ok_or_else(|| test_error("toggle redo was unavailable"))?;
    assert!(has_format(session.state().document(), &name(FORMAT)?)?);
    assert_eq!(observed_activation(&profile, &session)?, ActionActivation::Active);
    Ok(())
}

#[test]
fn disabled_extension_toggle_blocks_both_routing_and_observable_state() -> TestResult {
    let profile = profile()?;
    let session = EditorSession::new(state(&profile, false, None, "profile-blocked")?);
    let intent = IntentId::try_new(INTENT)?;
    let route =
        profile.intent_router().route(session.state(), &IntentInvocation::without_input(intent))?;
    let IntentRouteOutcome::Blocked(blocked) = route else {
        return Err(test_error("selection-free toggle did not block its route").into());
    };
    assert_eq!(blocked.binding().id().as_str(), BINDING);
    assert_eq!(blocked.reason().code().as_str(), "breditor/no-selection");
    assert_eq!(blocked.indicator().activation(), ActionActivation::Inactive);

    let batch = profile.action_state_catalog().derive(&session)?;
    let state_id = ActionStateId::try_new(ACTION_STATE)?;
    let entry = batch
        .entry(&state_id)
        .ok_or_else(|| test_error("blocked profile state entry is missing"))?;
    let ActionStateOutcome::Resolved(resolved) = entry.outcome() else {
        return Err(test_error("blocked profile state did not resolve").into());
    };
    let ObservedAvailability::Blocked(reason) = resolved.availability() else {
        return Err(test_error("blocked route was not retained as blocked state").into());
    };
    assert_eq!(reason.code().as_str(), "breditor/no-selection");
    assert_eq!(resolved.indicator().activation(), ActionActivation::Inactive);
    Ok(())
}

#[test]
fn semantic_toggle_identity_changes_do_not_change_schema_fingerprint() -> TestResult {
    let first = CompiledEditorProfile::try_compile_base_text_profile(
        schema_id()?,
        extensions(
            "example/first-owner",
            1,
            toggle(FORMAT, ACTION, INTENT, BINDING, ACTION_STATE)?,
        )?,
    )?;
    let second = CompiledEditorProfile::try_compile_base_text_profile(
        schema_id()?,
        extensions(
            "example/renamed-owner",
            99,
            toggle(FORMAT, "renamed/action", "renamed/intent", "renamed/binding", "renamed/state")?,
        )?,
    )?;
    let without_toggle = CompiledEditorProfile::try_compile_base_text_profile(
        schema_id()?,
        extensions_with_toggles("example/schema-only-owner", 7, Vec::new())?,
    )?;

    assert_eq!(first.schema(), second.schema());
    assert_eq!(first.schema().fingerprint(), second.schema().fingerprint());
    assert_eq!(first.schema(), without_toggle.schema());
    assert_eq!(first.schema().fingerprint(), without_toggle.schema().fingerprint());
    assert_eq!(without_toggle.intent_router().intent_count(), 0);
    assert_eq!(without_toggle.intent_router().binding_count(), 0);
    assert_ne!(first.generation(), second.generation());
    assert_eq!(first.generation(), first.clone().generation());
    let generation = first.generation();
    assert_eq!(format!("{generation:?}"), "CompiledProfileGeneration { .. }");
    Ok(())
}

//! Rust conformance proof for the reference Text Size preset extension.
//!
//! Text Size is deliberately not a core-specific action. These tests compile
//! the exact `example/text-size@1` integer contract and prove that the generic
//! setter, state, operations, history, and V3 checkpoint path preserve every
//! value in its exhaustive `0..=2` domain. Labels, `<select>` options, data
//! tokens, and CSS remain browser presentation outside this crate.

mod support;

use std::error::Error;

use breditor_core::{
    action::{
        ActionActivation, ActionId, ActionInput, ActionStateId, ActionStateOutcome,
        ActionStateValue, ActionValue,
        builtins::{inline_format_properties_state_contract, set_inline_format_input_contract},
        routing::{BindingId, IntentExecutionOutcome, IntentId, IntentInvocation},
    },
    codec::{
        COMMIT_V3_FORMAT_VERSION, CommitJsonCodecV3, DOCUMENT_V2_FORMAT_VERSION,
        DocumentJsonCodecV2, SESSION_CHECKPOINT_V3_FORMAT_VERSION, SessionCheckpointJsonCodecV3,
    },
    document::{Document, PropertyInteger, PropertyValue},
    extension::{
        ExtensionId, ExtensionLimits, ExtensionManifest, ExtensionSet, ExtensionVersion,
        InlineFormatPropertyContractV1, InlineFormatPropertySpecV1, InlineFormatPropertyTypeV1,
        InlineFormatSetSpecV1, InlineFormatSpecV1, PropertyPresenceV1,
    },
    identity::QualifiedName,
    operation::Operation,
    position::{Affinity, Point},
    profile::CompiledEditorProfile,
    schema::{DocumentLimits, PersistedTypeRevision, SchemaId, SchemaVersion},
    selection::{RangeSelection, Selection},
    session::EditorSession,
    state::{EditorState, LineageId},
    transaction::Commit,
};
use serde_json::{Value, json};
use support::{TestResult, path, test_error};

const FORMAT_KIND: &str = "example/text-size";
const PROPERTY_NAME: &str = "example/text-size-step";
const EXTENSION_NAME: &str = "example/text-size-extension";
const ACTION_ID: &str = "example/set-text-size";
const INTENT_ID: &str = "example/set-text-size-intent";
const BINDING_ID: &str = "example/set-text-size-binding";
const ACTION_STATE_ID: &str = "example/text-size-presence";
const MINIMUM: i64 = 0;
const MAXIMUM: i64 = 2;

fn name(value: &str) -> Result<QualifiedName, Box<dyn Error>> {
    QualifiedName::try_new(value).map_err(Into::into)
}

fn profile() -> Result<CompiledEditorProfile, Box<dyn Error>> {
    let format_kind = name(FORMAT_KIND)?;
    let property_contract = InlineFormatPropertyContractV1::try_new(
        format_kind.clone(),
        vec![InlineFormatPropertySpecV1::new(
            name(PROPERTY_NAME)?,
            PropertyPresenceV1::Required,
            InlineFormatPropertyTypeV1::try_integer(
                Some(PropertyInteger::try_new(MINIMUM)?),
                Some(PropertyInteger::try_new(MAXIMUM)?),
            )?,
        )],
    )?;
    let set = InlineFormatSetSpecV1::new(
        format_kind.clone(),
        ActionId::try_new(ACTION_ID)?,
        IntentId::try_new(INTENT_ID)?,
        BindingId::try_new(BINDING_ID)?,
        ActionStateId::try_new(ACTION_STATE_ID)?,
    );
    let manifest = ExtensionManifest::try_new_with_inline_format_declarations_and_sets(
        ExtensionId::new(name(EXTENSION_NAME)?, ExtensionVersion::one()),
        Vec::new(),
        Vec::new(),
        vec![InlineFormatSpecV1::new(format_kind, PersistedTypeRevision::one())],
        vec![property_contract],
        Vec::new(),
        vec![set],
    )?;
    let extensions = ExtensionSet::try_new(vec![manifest], ExtensionLimits::default())?;
    CompiledEditorProfile::try_compile_base_text_profile(
        SchemaId::new(name("example/text-size-contract-profile")?, SchemaVersion::try_new(1)?),
        extensions,
    )
    .map_err(Into::into)
}

fn text_point(paragraph: u32, offset: u32, affinity: Affinity) -> Result<Point, Box<dyn Error>> {
    Ok(Point::Text { text_path: path(&[paragraph, 0])?, utf16_offset: offset, affinity })
}

fn selection(
    anchor_paragraph: u32,
    anchor_offset: u32,
    focus_paragraph: u32,
    focus_offset: u32,
) -> Result<Selection, Box<dyn Error>> {
    Ok(RangeSelection::new(
        text_point(anchor_paragraph, anchor_offset, Affinity::After)?,
        text_point(focus_paragraph, focus_offset, Affinity::Before)?,
    )
    .into())
}

fn document_json(
    profile: &CompiledEditorProfile,
    paragraphs: &[&str],
    step: Option<Value>,
) -> String {
    let formats = step.map_or_else(Vec::new, |step| {
        vec![json!({
            "type": FORMAT_KIND,
            "properties": { PROPERTY_NAME: step },
        })]
    });
    let children = paragraphs
        .iter()
        .map(|text| {
            json!({
                "kind": "element",
                "type": "breditor/paragraph",
                "entityId": null,
                "properties": {},
                "children": [{
                    "kind": "text",
                    "text": text,
                    "formats": formats,
                }],
            })
        })
        .collect::<Vec<_>>();
    json!({
        "format": "breditor/document",
        "formatVersion": DOCUMENT_V2_FORMAT_VERSION,
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
            "children": children,
        },
    })
    .to_string()
}

fn state(
    profile: &CompiledEditorProfile,
    paragraphs: &[&str],
    selection: Selection,
    lineage: &str,
) -> Result<EditorState, Box<dyn Error>> {
    let context = profile.editor_context(DocumentLimits::default());
    let document = DocumentJsonCodecV2::new(profile.schema().clone())
        .with_limits(context.limits().clone())
        .decode(&document_json(profile, paragraphs, None))?;
    EditorState::try_new(&context, LineageId::try_new(lineage)?, document, Some(selection), None)
        .map_err(Into::into)
}

fn set_input(step: i64) -> Result<ActionInput, Box<dyn Error>> {
    let property = ActionValue::try_object(vec![
        ("name".to_owned(), ActionValue::try_from_string(PROPERTY_NAME)?),
        ("value".to_owned(), ActionValue::from_integer(PropertyInteger::try_new(step)?)),
    ])?;
    let value = ActionValue::try_object(vec![
        ("operation".to_owned(), ActionValue::try_from_string("set")?),
        ("properties".to_owned(), ActionValue::try_array(vec![property])?),
    ])?;
    Ok(ActionInput::typed(set_inline_format_input_contract(), value))
}

fn set_intent(step: i64) -> Result<IntentInvocation, Box<dyn Error>> {
    Ok(IntentInvocation::new(IntentId::try_new(INTENT_ID)?, set_input(step)?))
}

fn execute(
    profile: &CompiledEditorProfile,
    session: &mut EditorSession,
    intent: &IntentInvocation,
) -> Result<IntentExecutionOutcome, Box<dyn Error>> {
    let route = profile.intent_router().route(session.state(), intent)?;
    session.execute_intent_route(route).map_err(Into::into)
}

fn commit(outcome: IntentExecutionOutcome, label: &str) -> Result<Commit, Box<dyn Error>> {
    outcome.into_commit().ok_or_else(|| test_error(format!("{label} did not commit")).into())
}

fn text_size_steps(document: &Document) -> Result<Vec<Option<i64>>, Box<dyn Error>> {
    let format_kind = name(FORMAT_KIND)?;
    let property_name = name(PROPERTY_NAME)?;
    let root = document
        .root()
        .as_element()
        .ok_or_else(|| test_error("Text Size document root is not an element"))?;
    let mut values = Vec::new();
    for paragraph in root.children() {
        let paragraph = paragraph
            .as_element()
            .ok_or_else(|| test_error("Text Size root child is not a paragraph"))?;
        for child in paragraph.children() {
            let text = child
                .as_text()
                .ok_or_else(|| test_error("Text Size paragraph child is not text"))?;
            values.push(
                text.formats()
                    .get(&format_kind)
                    .and_then(|format| format.properties().get(&property_name))
                    .and_then(PropertyValue::as_integer)
                    .map(PropertyInteger::get),
            );
        }
    }
    Ok(values)
}

fn observed_step(
    profile: &CompiledEditorProfile,
    session: &EditorSession,
) -> Result<(ActionActivation, Option<i64>), Box<dyn Error>> {
    let batch = profile.action_state_catalog().derive(session)?;
    let entry = batch
        .entry(&ActionStateId::try_new(ACTION_STATE_ID)?)
        .ok_or_else(|| test_error("generated Text Size state is missing"))?;
    let ActionStateOutcome::Resolved(resolved) = entry.outcome() else {
        return Err(test_error("generated Text Size state did not resolve").into());
    };
    let step = match resolved.indicator().value() {
        ActionStateValue::Unset { contract } => {
            assert_eq!(contract, &inline_format_properties_state_contract());
            None
        }
        ActionStateValue::Uniform { contract, value } => {
            assert_eq!(contract, &inline_format_properties_state_contract());
            let properties = value
                .as_object()
                .and_then(|object| object.get("properties"))
                .and_then(ActionValue::as_array)
                .ok_or_else(|| test_error("uniform Text Size state has no property list"))?;
            let [property] = properties else {
                return Err(
                    test_error("uniform Text Size state is not a single-property map").into()
                );
            };
            let property = property
                .as_object()
                .ok_or_else(|| test_error("uniform Text Size property is not an object"))?;
            assert_eq!(property.get("name").and_then(ActionValue::as_string), Some(PROPERTY_NAME));
            property.get("value").and_then(ActionValue::as_integer).map(PropertyInteger::get)
        }
        ActionStateValue::Mixed { .. } | ActionStateValue::Unsupported => {
            return Err(test_error("uniform Text Size selection reported no exact value").into());
        }
    };
    Ok((resolved.indicator().activation(), step))
}

fn assert_editor_value(actual: &EditorState, expected: &EditorState) {
    assert_eq!(actual.document(), expected.document());
    assert_eq!(actual.selection(), expected.selection());
    assert_eq!(actual.pending_formats(), expected.pending_formats());
}

#[test]
fn exhaustive_integer_domain_compiles_and_rejects_every_adjacent_invalid_value() -> TestResult {
    let profile = profile()?;
    let format_kind = name(FORMAT_KIND)?;
    let contract = profile
        .schema()
        .inline_format_property_contract(&format_kind)
        .ok_or_else(|| test_error("compiled Text Size property contract is missing"))?;
    let [property] = contract.properties() else {
        return Err(test_error("Text Size contract is not a single-property contract").into());
    };
    assert_eq!(property.name(), &name(PROPERTY_NAME)?);
    assert_eq!(property.presence(), PropertyPresenceV1::Required);
    let InlineFormatPropertyTypeV1::Integer(integer) = property.value_type() else {
        return Err(test_error("Text Size property is not an integer").into());
    };
    assert_eq!(integer.minimum().map(PropertyInteger::get), Some(MINIMUM));
    assert_eq!(integer.maximum().map(PropertyInteger::get), Some(MAXIMUM));

    let set = profile
        .descriptor()
        .inline_format_set(&format_kind)
        .ok_or_else(|| test_error("compiled Text Size set surface is missing"))?;
    assert_eq!(set.intent_id().as_str(), INTENT_ID);
    assert_eq!(set.action_state_id().as_str(), ACTION_STATE_ID);
    assert!(profile.action_registry().descriptor(&ActionId::try_new(ACTION_ID)?).is_some());
    assert!(profile.intent_router().binding(&BindingId::try_new(BINDING_ID)?).is_some());

    let codec = DocumentJsonCodecV2::new(profile.schema().clone());
    for step in MINIMUM..=MAXIMUM {
        let decoded = codec.decode(&document_json(&profile, &["abc"], Some(json!(step))))?;
        assert_eq!(text_size_steps(&decoded)?, vec![Some(step)]);
    }
    for step in [MINIMUM - 1, MAXIMUM + 1] {
        assert!(codec.decode(&document_json(&profile, &["abc"], Some(json!(step)))).is_err());
    }
    assert!(codec.decode(&document_json(&profile, &["abc"], Some(json!(1.5)))).is_err());

    let mut session = EditorSession::new(state(
        &profile,
        &["abc"],
        selection(0, 0, 0, 3)?,
        "text-size-exhaustive-domain",
    )?);
    for step in MINIMUM..=MAXIMUM {
        commit(execute(&profile, &mut session, &set_intent(step)?)?, "Text Size domain value")?;
        assert_eq!(text_size_steps(session.state().document())?, vec![Some(step)]);
        assert_eq!(observed_step(&profile, &session)?, (ActionActivation::Active, Some(step)));
    }
    for step in [MINIMUM - 1, MAXIMUM + 1] {
        let blocked = execute(&profile, &mut session, &set_intent(step)?)?;
        assert!(blocked.commit().is_none());
        assert_eq!(
            blocked.blocked_reason().map(|reason| reason.code().as_str()),
            Some("breditor/invalid-inline-format-properties")
        );
        assert_eq!(text_size_steps(session.state().document())?, vec![Some(MAXIMUM)]);
    }
    Ok(())
}

#[test]
fn cross_paragraph_set_is_one_exact_history_unit_and_survives_v3_replay() -> TestResult {
    let profile = profile()?;
    let context = profile.editor_context(DocumentLimits::default());
    let initial =
        state(&profile, &["ab", "cd"], selection(1, 2, 0, 0)?, "text-size-cross-paragraph")?;
    let initial_value = initial.clone();
    let mut session = EditorSession::new(initial);

    let set_commit = commit(execute(&profile, &mut session, &set_intent(MAXIMUM)?)?, "Text Size")?;
    assert!(matches!(set_commit.forward_operations(), [Operation::RootTextReplace(_)]));
    assert_eq!(text_size_steps(session.state().document())?, vec![Some(MAXIMUM), Some(MAXIMUM)]);
    assert_eq!(observed_step(&profile, &session)?, (ActionActivation::Active, Some(MAXIMUM)));
    assert_eq!((session.undo_depth(), session.redo_depth()), (1, 0));

    let commit_codec = CommitJsonCodecV3::new(context.clone());
    let commit_json = commit_codec.encode(&set_commit)?;
    let commit_value: Value = serde_json::from_str(&commit_json)?;
    assert_eq!(commit_value["formatVersion"], json!(COMMIT_V3_FORMAT_VERSION));
    assert!(commit_json.contains(r#""example/text-size-step":2"#));
    assert_eq!(commit_codec.decode(&commit_json)?, set_commit);

    session.undo()?.ok_or_else(|| test_error("Text Size undo was unavailable"))?;
    assert_editor_value(session.state(), &initial_value);
    assert_eq!(observed_step(&profile, &session)?, (ActionActivation::Inactive, None));
    session.redo()?.ok_or_else(|| test_error("Text Size redo was unavailable"))?;
    assert_eq!(text_size_steps(session.state().document())?, vec![Some(MAXIMUM), Some(MAXIMUM)]);

    let checkpoint_codec = SessionCheckpointJsonCodecV3::new(context);
    let checkpoint_json = checkpoint_codec.encode(&session)?;
    let checkpoint_value: Value = serde_json::from_str(&checkpoint_json)?;
    assert_eq!(checkpoint_value["formatVersion"], json!(SESSION_CHECKPOINT_V3_FORMAT_VERSION));
    assert!(checkpoint_json.contains("rootTextReplace"));
    assert!(checkpoint_json.contains(r#""example/text-size-step":2"#));

    let mut restored = checkpoint_codec.decode(&checkpoint_json)?;
    assert_eq!(restored.state(), session.state());
    assert_eq!((restored.undo_depth(), restored.redo_depth()), (1, 0));
    restored.undo()?.ok_or_else(|| test_error("restored Text Size undo was unavailable"))?;
    assert_editor_value(restored.state(), &initial_value);
    restored.redo()?.ok_or_else(|| test_error("restored Text Size redo was unavailable"))?;
    assert_eq!(text_size_steps(restored.state().document())?, vec![Some(MAXIMUM), Some(MAXIMUM)]);
    Ok(())
}

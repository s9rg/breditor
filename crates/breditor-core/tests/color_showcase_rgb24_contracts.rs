//! End-to-end Rust contracts for the reference RGB24 text-color vertical slice.
//!
//! This deliberately uses a minimal profile containing the exact
//! `example/text-color@1` format. Browser presentation remains outside core;
//! the tests prove that the generic profile compiler, action pipeline, history,
//! and durable codecs preserve the same bounded integer semantics.

mod support;

use std::error::Error;

use breditor_core::{
    action::{
        ActionId, ActionInput, ActionStateId, ActionValue,
        builtins::{
            clear_inline_formatting_intent_id, inline_format_properties_state_contract,
            set_inline_format_input_contract,
        },
        routing::{BindingId, IntentExecutionOutcome, IntentId, IntentInvocation},
    },
    codec::{
        COMMIT_V3_FORMAT_VERSION, CommitJsonCodecV3, DOCUMENT_V2_FORMAT_VERSION,
        DocumentJsonCodecV2, EDITOR_STATE_V3_FORMAT_VERSION, EditorStateJsonCodecV3,
        SESSION_CHECKPOINT_V3_FORMAT_VERSION, SessionCheckpointJsonCodecV3,
    },
    document::{Document, PropertyInteger},
    extension::{
        ExtensionId, ExtensionLimits, ExtensionManifest, ExtensionSet, ExtensionVersion,
        InlineFormatPropertyContractV1, InlineFormatPropertySpecV1, InlineFormatPropertyTypeV1,
        InlineFormatSetSpecV1, InlineFormatSpecV1, PropertyPresenceV1,
    },
    identity::QualifiedName,
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

const FORMAT_KIND: &str = "example/text-color";
const PROPERTY_NAME: &str = "example/rgb24";
const EXTENSION_NAME: &str = "example/text-color-extension";
const ACTION_ID: &str = "example/set-text-color";
const INTENT_ID: &str = "example/set-text-color-intent";
const BINDING_ID: &str = "example/set-text-color-binding";
const ACTION_STATE_ID: &str = "example/text-color-presence";
const RGB24_MINIMUM: i64 = 0;
const RGB24_MAXIMUM: i64 = 0xff_ffff;
const SELECTED_RGB24: i64 = 0x12_34_56;

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
                Some(PropertyInteger::try_new(RGB24_MINIMUM)?),
                Some(PropertyInteger::try_new(RGB24_MAXIMUM)?),
            )?,
        )],
    )?;
    let setter = InlineFormatSetSpecV1::new(
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
        vec![setter],
    )?;
    let extensions = ExtensionSet::try_new(vec![manifest], ExtensionLimits::default())?;
    CompiledEditorProfile::try_compile_base_text_profile(
        SchemaId::new(name("example/rgb24-contract-profile")?, SchemaVersion::try_new(1)?),
        extensions,
    )
    .map_err(Into::into)
}

fn selected_text() -> Result<Selection, Box<dyn Error>> {
    let anchor =
        Point::Text { text_path: path(&[0, 0])?, utf16_offset: 0, affinity: Affinity::Before };
    let focus =
        Point::Text { text_path: path(&[0, 0])?, utf16_offset: 3, affinity: Affinity::After };
    Ok(RangeSelection::new(anchor, focus).into())
}

fn document_json(profile: &CompiledEditorProfile, properties: Option<Value>) -> String {
    let formats = properties.map_or_else(Vec::new, |properties| {
        vec![json!({
            "type": FORMAT_KIND,
            "properties": properties,
        })]
    });
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
            "children": [{
                "kind": "element",
                "type": "breditor/paragraph",
                "entityId": null,
                "properties": {},
                "children": [{
                    "kind": "text",
                    "text": "abc",
                    "formats": formats,
                }],
            }],
        },
    })
    .to_string()
}

fn initial_state(
    profile: &CompiledEditorProfile,
    lineage: &str,
) -> Result<EditorState, Box<dyn Error>> {
    let context = profile.editor_context(DocumentLimits::default());
    let document = DocumentJsonCodecV2::new(profile.schema().clone())
        .with_limits(context.limits().clone())
        .decode(&document_json(profile, None))?;
    EditorState::try_new(
        &context,
        LineageId::try_new(lineage)?,
        document,
        Some(selected_text()?),
        None,
    )
    .map_err(Into::into)
}

fn set_input(value: i64) -> Result<ActionInput, Box<dyn Error>> {
    let property = ActionValue::try_object(vec![
        ("name".to_owned(), ActionValue::try_from_string(PROPERTY_NAME)?),
        ("value".to_owned(), ActionValue::from_integer(PropertyInteger::try_new(value)?)),
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

fn set_intent(value: i64) -> Result<IntentInvocation, Box<dyn Error>> {
    Ok(IntentInvocation::new(IntentId::try_new(INTENT_ID)?, set_input(value)?))
}

fn remove_intent() -> Result<IntentInvocation, Box<dyn Error>> {
    Ok(IntentInvocation::new(IntentId::try_new(INTENT_ID)?, remove_input()?))
}

fn execute_intent(
    profile: &CompiledEditorProfile,
    session: &mut EditorSession,
    invocation: &IntentInvocation,
) -> Result<IntentExecutionOutcome, Box<dyn Error>> {
    let route = profile.intent_router().route(session.state(), invocation)?;
    session.execute_intent_route(route).map_err(Into::into)
}

fn committed(outcome: IntentExecutionOutcome, description: &str) -> Result<Commit, Box<dyn Error>> {
    outcome.into_commit().ok_or_else(|| test_error(format!("{description} did not commit")).into())
}

fn rgb24(document: &Document) -> Result<Option<i64>, Box<dyn Error>> {
    let format_kind = name(FORMAT_KIND)?;
    let property_name = name(PROPERTY_NAME)?;
    let text = document
        .root()
        .as_element()
        .and_then(|root| root.children().get(0))
        .and_then(breditor_core::document::NodeRef::as_element)
        .and_then(|paragraph| paragraph.children().get(0))
        .and_then(breditor_core::document::NodeRef::as_text)
        .ok_or_else(|| test_error("RGB24 test document lost its text leaf"))?;
    Ok(text
        .formats()
        .get(&format_kind)
        .and_then(|format| format.properties().get(&property_name))
        .and_then(breditor_core::document::PropertyValue::as_integer)
        .map(PropertyInteger::get))
}

#[test]
fn exact_contract_generates_set_remove_state_and_enforces_both_rgb24_endpoints() -> TestResult {
    let profile = profile()?;
    let format_kind = name(FORMAT_KIND)?;
    let property_name = name(PROPERTY_NAME)?;
    let contract = profile
        .schema()
        .inline_format_property_contract(&format_kind)
        .ok_or_else(|| test_error("compiled RGB24 property contract is missing"))?;
    let [property] = contract.properties() else {
        return Err(test_error("RGB24 contract is not a single-property contract").into());
    };
    assert_eq!(property.name(), &property_name);
    assert_eq!(property.presence(), PropertyPresenceV1::Required);
    let InlineFormatPropertyTypeV1::Integer(integer) = property.value_type() else {
        return Err(test_error("RGB24 property is not an integer").into());
    };
    assert_eq!(integer.minimum().map(PropertyInteger::get), Some(RGB24_MINIMUM));
    assert_eq!(integer.maximum().map(PropertyInteger::get), Some(RGB24_MAXIMUM));

    let set = profile
        .descriptor()
        .inline_format_set(&format_kind)
        .ok_or_else(|| test_error("compiled RGB24 set surface is missing"))?;
    assert_eq!(set.intent_id().as_str(), INTENT_ID);
    assert_eq!(set.action_state_id().as_str(), ACTION_STATE_ID);
    let action = profile
        .action_registry()
        .descriptor(&ActionId::try_new(ACTION_ID)?)
        .ok_or_else(|| test_error("generated RGB24 action is missing"))?;
    assert_eq!(action.input_contract(), Some(&set_inline_format_input_contract()));
    let intent = profile
        .intent_router()
        .declaration(&IntentId::try_new(INTENT_ID)?)
        .ok_or_else(|| test_error("generated RGB24 intent is missing"))?;
    assert_eq!(intent.input_contract(), Some(&set_inline_format_input_contract()));
    assert_eq!(
        intent.state_spec().contract().value_contract(),
        Some(&inline_format_properties_state_contract())
    );
    let binding = profile
        .intent_router()
        .binding(&BindingId::try_new(BINDING_ID)?)
        .ok_or_else(|| test_error("generated RGB24 binding is missing"))?;
    assert_eq!(binding.action_id().as_str(), ACTION_ID);
    assert_eq!(binding.intent_id().as_str(), INTENT_ID);
    assert!(
        profile
            .action_state_catalog()
            .descriptor(&ActionStateId::try_new(ACTION_STATE_ID)?)
            .is_some()
    );

    let codec = DocumentJsonCodecV2::new(profile.schema().clone());
    for endpoint in [RGB24_MINIMUM, RGB24_MAXIMUM] {
        let document =
            codec.decode(&document_json(&profile, Some(json!({PROPERTY_NAME: endpoint}))))?;
        assert_eq!(rgb24(&document)?, Some(endpoint));
    }
    for invalid in [
        Some(json!({})),
        Some(json!({PROPERTY_NAME: RGB24_MINIMUM - 1})),
        Some(json!({PROPERTY_NAME: RGB24_MAXIMUM + 1})),
    ] {
        assert!(codec.decode(&document_json(&profile, invalid)).is_err());
    }

    let mut session = EditorSession::new(initial_state(&profile, "rgb24-endpoints")?);
    for endpoint in [RGB24_MINIMUM, RGB24_MAXIMUM] {
        committed(
            execute_intent(&profile, &mut session, &set_intent(endpoint)?)?,
            "RGB24 endpoint set intent",
        )?;
        assert_eq!(rgb24(session.state().document())?, Some(endpoint));
    }
    for invalid in [RGB24_MINIMUM - 1, RGB24_MAXIMUM + 1] {
        let outcome = execute_intent(&profile, &mut session, &set_intent(invalid)?)?;
        assert!(outcome.commit().is_none());
        assert_eq!(
            outcome.blocked_reason().map(|reason| reason.code().as_str()),
            Some("breditor/invalid-inline-format-properties")
        );
        assert_eq!(rgb24(session.state().document())?, Some(RGB24_MAXIMUM));
    }
    committed(execute_intent(&profile, &mut session, &remove_intent()?)?, "RGB24 remove intent")?;
    assert_eq!(rgb24(session.state().document())?, None);
    Ok(())
}

#[test]
fn rgb24_set_clear_and_history_replay_through_document_state_commit_and_session_codecs()
-> TestResult {
    let profile = profile()?;
    let context = profile.editor_context(DocumentLimits::default());
    let mut session = EditorSession::new(initial_state(&profile, "rgb24-durable-history")?);

    let set_commit = committed(
        execute_intent(&profile, &mut session, &set_intent(SELECTED_RGB24)?)?,
        "RGB24 set intent",
    )?;
    assert_eq!(rgb24(session.state().document())?, Some(SELECTED_RGB24));
    assert_eq!((session.undo_depth(), session.redo_depth()), (1, 0));

    let document_codec = DocumentJsonCodecV2::new(profile.schema().clone());
    let document_json = document_codec.encode(session.state().document())?;
    let document_value: Value = serde_json::from_str(&document_json)?;
    assert_eq!(document_value["formatVersion"], json!(DOCUMENT_V2_FORMAT_VERSION));
    assert_eq!(
        document_value.pointer("/root/children/0/children/0/formats/0/properties/example~1rgb24"),
        Some(&json!(SELECTED_RGB24))
    );
    assert_eq!(document_codec.decode(&document_json)?, *session.state().document());

    let state_codec = EditorStateJsonCodecV3::new(context.clone());
    let state_json = state_codec.encode(session.state())?;
    let state_value: Value = serde_json::from_str(&state_json)?;
    assert_eq!(state_value["formatVersion"], json!(EDITOR_STATE_V3_FORMAT_VERSION));
    assert_eq!(state_value["document"]["formatVersion"], json!(DOCUMENT_V2_FORMAT_VERSION));
    assert_eq!(state_codec.decode(&state_json)?, *session.state());

    let commit_codec = CommitJsonCodecV3::new(context.clone());
    let set_commit_json = commit_codec.encode(&set_commit)?;
    let set_commit_value: Value = serde_json::from_str(&set_commit_json)?;
    assert_eq!(set_commit_value["formatVersion"], json!(COMMIT_V3_FORMAT_VERSION));
    assert_eq!(
        set_commit_value
            .pointer("/forwardOperations/0/replacement/runs/0/formats/0/properties/example~1rgb24"),
        Some(&json!(SELECTED_RGB24))
    );
    assert_eq!(commit_codec.decode(&set_commit_json)?, set_commit);

    session.undo()?.ok_or_else(|| test_error("RGB24 set undo was unavailable"))?;
    assert_eq!(rgb24(session.state().document())?, None);
    session.redo()?.ok_or_else(|| test_error("RGB24 set redo was unavailable"))?;
    assert_eq!(rgb24(session.state().document())?, Some(SELECTED_RGB24));

    let clear = IntentInvocation::without_input(clear_inline_formatting_intent_id());
    let clear_commit = committed(
        execute_intent(&profile, &mut session, &clear)?,
        "Clear Inline Formatting intent",
    )?;
    assert_eq!(rgb24(session.state().document())?, None);
    assert_eq!((session.undo_depth(), session.redo_depth()), (2, 0));
    let clear_commit_json = commit_codec.encode(&clear_commit)?;
    assert!(clear_commit_json.contains(r#""example/rgb24":1193046"#));
    assert_eq!(commit_codec.decode(&clear_commit_json)?, clear_commit);

    session.undo()?.ok_or_else(|| test_error("Clear Inline Formatting undo was unavailable"))?;
    assert_eq!(rgb24(session.state().document())?, Some(SELECTED_RGB24));
    assert_eq!((session.undo_depth(), session.redo_depth()), (1, 1));

    let session_codec = SessionCheckpointJsonCodecV3::new(context);
    let checkpoint_json = session_codec.encode(&session)?;
    let checkpoint_value: Value = serde_json::from_str(&checkpoint_json)?;
    assert_eq!(checkpoint_value["formatVersion"], json!(SESSION_CHECKPOINT_V3_FORMAT_VERSION));
    assert_eq!(
        checkpoint_value["historyBase"]["document"]["formatVersion"],
        json!(DOCUMENT_V2_FORMAT_VERSION)
    );
    assert!(checkpoint_json.contains(r#""example/rgb24":1193046"#));

    let mut restored = session_codec.decode(&checkpoint_json)?;
    assert_eq!(restored.state(), session.state());
    assert_eq!((restored.undo_depth(), restored.redo_depth()), (1, 1));
    restored
        .redo()?
        .ok_or_else(|| test_error("restored Clear Inline Formatting redo was unavailable"))?;
    assert_eq!(rgb24(restored.state().document())?, None);
    restored
        .undo()?
        .ok_or_else(|| test_error("restored Clear Inline Formatting undo was unavailable"))?;
    assert_eq!(rgb24(restored.state().document())?, Some(SELECTED_RGB24));
    Ok(())
}

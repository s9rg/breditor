//! Black-box contracts for the property-preserving guarded-engine checkpoint policy.

use std::{error::Error, io};

use breditor_core::{
    action::{
        ActionId, ActionInput, ActionInvocation, ActionValue,
        builtins::{
            insert_text_action_id, insert_text_input_contract, set_inline_format_input_contract,
        },
        routing::{IntentExecutionOutcome, IntentId, IntentInvocation},
    },
    codec::{
        CodecErrorCode, DocumentJsonCodec, DocumentJsonCodecV2, SESSION_CHECKPOINT_FORMAT_VERSION,
        SESSION_CHECKPOINT_V2_FORMAT_VERSION, SESSION_CHECKPOINT_V3_FORMAT_VERSION,
        SessionCheckpointJsonCodec, SessionCheckpointJsonCodecV2, SessionCheckpointJsonCodecV3,
        SessionCheckpointLimits,
    },
    document::PropertyValue,
    engine::{
        CheckpointedEditorEngine, CheckpointedEditorEngineError, CheckpointedEditorEngineErrorCode,
        EditorActionOutcome, EditorEngine, EditorEngineEventKind,
    },
    extension::{
        ExtensionId, ExtensionLimits, ExtensionManifest, ExtensionSet, ExtensionVersion,
        InlineFormatPropertyContractV1, InlineFormatPropertySpecV1, InlineFormatPropertyTypeV1,
        InlineFormatSetSpecV1, InlineFormatSpecV1, PropertyPresenceV1,
    },
    identity::QualifiedName,
    position::{Affinity, NodePath, Point},
    profile::CompiledEditorProfile,
    schema::{DocumentLimits, PersistedTypeRevision, SchemaId, SchemaVersion},
    selection::{RangeSelection, Selection},
    session::{EditorSession, HistoryCapacity},
    state::{EditorContext, EditorState, LineageId},
};
use serde_json::json;

type TestResult<T = ()> = Result<T, Box<dyn Error>>;

const LINK: &str = "example/link";
const HREF: &str = "example/href";
const SET_LINK_ACTION: &str = "example/set-link";

fn name(value: &str) -> TestResult<QualifiedName> {
    QualifiedName::try_new(value).map_err(Into::into)
}

fn point(offset: u32, affinity: Affinity) -> TestResult<Point> {
    Ok(Point::Text {
        text_path: NodePath::try_from_indices(vec![0, 0])?,
        utf16_offset: offset,
        affinity,
    })
}

fn collapsed(offset: u32) -> TestResult<Selection> {
    let point = point(offset, Affinity::After)?;
    Ok(RangeSelection::new(point.clone(), point).into())
}

fn selected_all() -> TestResult<Selection> {
    Ok(RangeSelection::new(point(0, Affinity::Before)?, point(3, Affinity::After)?).into())
}

fn typed_profile() -> TestResult<CompiledEditorProfile> {
    let link = name(LINK)?;
    let contract = InlineFormatPropertyContractV1::try_new(
        link.clone(),
        vec![InlineFormatPropertySpecV1::new(
            name(HREF)?,
            PropertyPresenceV1::Required,
            InlineFormatPropertyTypeV1::try_string(1, 2_048)?,
        )],
    )?;
    let setter = InlineFormatSetSpecV1::new(
        link.clone(),
        ActionId::try_new(SET_LINK_ACTION)?,
        breditor_core::action::routing::IntentId::try_new("example/set-link-intent")?,
        breditor_core::action::routing::BindingId::try_new("example/set-link-binding")?,
        breditor_core::action::ActionStateId::try_new("example/link-presence")?,
    );
    let manifest = ExtensionManifest::try_new_with_inline_format_declarations_and_sets(
        ExtensionId::new(name("example/link-extension")?, ExtensionVersion::one()),
        Vec::new(),
        Vec::new(),
        vec![InlineFormatSpecV1::new(link, PersistedTypeRevision::one())],
        vec![contract],
        Vec::new(),
        vec![setter],
    )?;
    let extensions = ExtensionSet::try_new(vec![manifest], ExtensionLimits::default())?;
    CompiledEditorProfile::try_compile_base_text_profile(
        SchemaId::new(name("example/link-profile")?, SchemaVersion::try_new(1)?),
        extensions,
    )
    .map_err(Into::into)
}

fn typed_engine(
    document_limits: DocumentLimits,
    selection: Selection,
    lineage: &str,
) -> TestResult<EditorEngine> {
    let profile = typed_profile()?;
    let context = profile.editor_context(document_limits);
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
    let document = DocumentJsonCodecV2::new(profile.schema().clone())
        .with_limits(context.limits().clone())
        .decode(&source)?;
    let state = EditorState::try_new(
        &context,
        LineageId::try_new(lineage)?,
        document,
        Some(selection),
        None,
    )?;
    let session = EditorSession::with_history_capacity(state, HistoryCapacity::try_new(8)?);
    EditorEngine::try_with_compiled_profile(session, profile).map_err(Into::into)
}

fn set_href(href: &str) -> TestResult<ActionInvocation> {
    let property = ActionValue::try_object(vec![
        ("name".to_owned(), ActionValue::try_from_string(HREF)?),
        ("value".to_owned(), ActionValue::try_from_string(href)?),
    ])?;
    let value = ActionValue::try_object(vec![
        ("operation".to_owned(), ActionValue::try_from_string("set")?),
        ("properties".to_owned(), ActionValue::try_array(vec![property])?),
    ])?;
    Ok(ActionInvocation::new(
        ActionId::try_new(SET_LINK_ACTION)?,
        ActionInput::typed(set_inline_format_input_contract(), value),
    ))
}

fn remove_link_input() -> TestResult<ActionInput> {
    let value = ActionValue::try_object(vec![(
        "operation".to_owned(),
        ActionValue::try_from_string("remove")?,
    )])?;
    Ok(ActionInput::typed(set_inline_format_input_contract(), value))
}

fn remove_link() -> TestResult<ActionInvocation> {
    Ok(ActionInvocation::new(ActionId::try_new(SET_LINK_ACTION)?, remove_link_input()?))
}

fn remove_link_intent() -> TestResult<IntentInvocation> {
    Ok(IntentInvocation::new(IntentId::try_new("example/set-link-intent")?, remove_link_input()?))
}

fn insert(text: &str) -> TestResult<ActionInvocation> {
    Ok(ActionInvocation::new(
        insert_text_action_id(),
        ActionInput::typed(insert_text_input_contract(), ActionValue::try_from_string(text)?),
    ))
}

fn pending_href(state: &EditorState) -> Option<&str> {
    state
        .pending_formats()
        .and_then(|formats| formats.get(&name(LINK).ok()?))
        .and_then(|format| format.properties().get(&name(HREF).ok()?))
        .and_then(PropertyValue::as_string)
}

fn text_runs(state: &EditorState) -> TestResult<Vec<(String, Option<String>)>> {
    let paragraph = state
        .document()
        .root()
        .as_element()
        .and_then(|root| root.children().get(0))
        .and_then(breditor_core::document::NodeRef::as_element)
        .ok_or_else(|| io::Error::other("test document lost its paragraph"))?;
    let link = name(LINK)?;
    let href = name(HREF)?;
    paragraph
        .children()
        .iter()
        .map(|node| {
            let text = node
                .as_text()
                .ok_or_else(|| io::Error::other("test paragraph gained a non-text child"))?;
            let value = text
                .formats()
                .get(&link)
                .and_then(|format| format.properties().get(&href))
                .and_then(PropertyValue::as_string)
                .map(str::to_owned);
            Ok((text.text().to_owned(), value))
        })
        .collect::<Result<Vec<_>, io::Error>>()
        .map_err(Into::into)
}

fn assert_exact_v3(engine: &CheckpointedEditorEngine) -> TestResult {
    let encoded = SessionCheckpointJsonCodecV3::new(engine.state().context().clone())
        .with_limits(*engine.session_checkpoint_limits())
        .encode(engine.session())?;
    assert_eq!(engine.session_checkpoint_json(), encoded);
    Ok(())
}

fn require_checkpoint_error<T: std::fmt::Debug>(
    result: Result<T, CheckpointedEditorEngineError>,
) -> TestResult<CheckpointedEditorEngineError> {
    match result {
        Err(error) => Ok(error),
        Ok(value) => {
            Err(io::Error::other(format!("expected checkpoint failure, got {value:?}")).into())
        }
    }
}

#[test]
fn v3_preserves_typed_pending_content_and_bidirectional_history() -> TestResult {
    const URL: &str = "https://example.test/typed";
    let raw = typed_engine(DocumentLimits::default(), collapsed(3)?, "engine-v3-history")?;
    let mut engine = CheckpointedEditorEngine::try_new_v3(raw, SessionCheckpointLimits::default())?;
    assert_eq!(engine.session_checkpoint_format_version(), SESSION_CHECKPOINT_V3_FORMAT_VERSION);
    assert_exact_v3(&engine)?;

    let before_set = engine.observation();
    assert!(matches!(
        engine.execute_action(&before_set, &set_href(URL)?)?,
        EditorActionOutcome::Committed(_)
    ));
    assert_eq!(pending_href(engine.state()), Some(URL));
    assert_eq!(engine.session().undo_depth(), 0);
    assert_exact_v3(&engine)?;

    let before_insert = engine.observation();
    assert!(matches!(
        engine.execute_action(&before_insert, &insert("x")?)?,
        EditorActionOutcome::Committed(_)
    ));
    assert_eq!(
        text_runs(engine.state())?,
        vec![("abc".to_owned(), None), ("x".to_owned(), Some(URL.to_owned()))]
    );
    assert_eq!(engine.session().undo_depth(), 1);
    assert_exact_v3(&engine)?;

    let restored = SessionCheckpointJsonCodecV3::new(engine.state().context().clone())
        .with_limits(*engine.session_checkpoint_limits())
        .decode(engine.session_checkpoint_json())?;
    assert_eq!(restored.state(), engine.state());
    assert_eq!(restored.history_capacity(), engine.session().history_capacity());
    assert_eq!(restored.undo_depth(), engine.session().undo_depth());
    assert_eq!(restored.redo_depth(), engine.session().redo_depth());

    let before_undo = engine.observation();
    let undo = engine
        .undo(&before_undo)?
        .ok_or_else(|| io::Error::other("typed insertion was not undoable"))?;
    assert_eq!(undo.kind(), EditorEngineEventKind::Undo);
    assert_eq!(text_runs(engine.state())?, vec![("abc".to_owned(), None)]);
    assert_eq!(pending_href(engine.state()), Some(URL));
    assert_exact_v3(&engine)?;

    let before_redo = engine.observation();
    let redo = engine
        .redo(&before_redo)?
        .ok_or_else(|| io::Error::other("typed insertion was not redoable"))?;
    assert_eq!(redo.kind(), EditorEngineEventKind::Redo);
    assert_eq!(
        text_runs(engine.state())?,
        vec![("abc".to_owned(), None), ("x".to_owned(), Some(URL.to_owned()))]
    );
    assert_exact_v3(&engine)?;
    Ok(())
}

#[test]
fn history_boundary_and_action_publish_as_one_candidate() -> TestResult {
    let mut engine = CheckpointedEditorEngine::try_new_v3(
        typed_engine(DocumentLimits::default(), collapsed(3)?, "engine-v3-sequence")?,
        SessionCheckpointLimits::default(),
    )?;
    let before_insert = engine.observation();
    assert!(matches!(
        engine.execute_action(&before_insert, &insert("x")?)?,
        EditorActionOutcome::Committed(_)
    ));
    let expected = engine.observation();
    let checkpoint = engine.session_checkpoint_json().to_owned();
    let state = engine.state().clone();

    let invalid = ActionInvocation::new(
        ActionId::try_new(SET_LINK_ACTION)?,
        ActionInput::typed(set_inline_format_input_contract(), ActionValue::null()),
    );
    assert!(engine.execute_action_after_closing_history_group(&expected, &invalid).is_err());
    assert_eq!(engine.session_checkpoint_json(), checkpoint);
    assert_eq!(engine.state(), &state);
    assert_eq!(engine.observation(), expected);

    let sequence = engine.execute_action_after_closing_history_group(&expected, &insert("y")?)?;
    assert_eq!(
        sequence.boundary().map(breditor_core::engine::EditorEngineEvent::kind),
        Some(EditorEngineEventKind::CloseHistoryGroup)
    );
    assert!(matches!(sequence.command(), EditorActionOutcome::Committed(_)));
    assert_eq!(text_runs(engine.state())?, vec![("abcxy".to_owned(), None)]);
    assert_exact_v3(&engine)?;

    let after_sequence = engine.observation();
    let undo = engine
        .undo(&after_sequence)?
        .ok_or_else(|| io::Error::other("sequenced insertion was not undoable"))?;
    assert_eq!(undo.kind(), EditorEngineEventKind::Undo);
    assert_eq!(text_runs(engine.state())?, vec![("abcx".to_owned(), None)]);
    Ok(())
}

#[test]
fn boundary_sequences_cover_noop_disabled_and_blocked_commands() -> TestResult {
    let mut engine = CheckpointedEditorEngine::try_new_v3(
        typed_engine(DocumentLimits::default(), collapsed(3)?, "engine-v3-boundary-matrix")?,
        SessionCheckpointLimits::default(),
    )?;

    let initial = engine.observation();
    let initial_state = engine.state().clone();
    let initial_history = engine.session().history_status();
    let initial_checkpoint = engine.session_checkpoint_json().to_owned();
    let noop = engine.execute_action_after_closing_history_group(&initial, &remove_link()?)?;
    assert!(noop.boundary().is_none());
    assert!(matches!(noop.command(), EditorActionOutcome::Disabled { .. }));
    assert_eq!(engine.state(), &initial_state);
    assert_eq!(engine.session().history_status(), initial_history);
    assert_eq!(engine.observation(), initial);
    assert_eq!(engine.session_checkpoint_json(), initial_checkpoint);

    let inserted = engine.execute_action(&initial, &insert("x")?)?;
    assert!(matches!(inserted, EditorActionOutcome::Committed(_)));
    let before_disabled = engine.observation();
    let disabled =
        engine.execute_action_after_closing_history_group(&before_disabled, &remove_link()?)?;
    assert!(disabled.boundary().is_some());
    let Some(disabled_outcome) = disabled.command().disabled() else {
        return Err(io::Error::other("remove unexpectedly committed").into());
    };
    assert_eq!(disabled_outcome.observation(), &engine.observation());
    assert_ne!(engine.observation(), before_disabled);
    assert_eq!(text_runs(engine.state())?, vec![("abcx".to_owned(), None)]);
    assert_exact_v3(&engine)?;

    let before_second_insert = engine.observation();
    let second_insert = engine.execute_action(&before_second_insert, &insert("y")?)?;
    assert!(matches!(second_insert, EditorActionOutcome::Committed(_)));
    let before_blocked = engine.observation();
    let blocked = engine
        .execute_intent_after_closing_history_group(&before_blocked, &remove_link_intent()?)?;
    assert!(blocked.boundary().is_some());
    assert!(matches!(blocked.command().execution(), IntentExecutionOutcome::Blocked { .. }));
    assert_eq!(blocked.command().observation(), &engine.observation());
    assert_ne!(engine.observation(), before_blocked);
    assert_eq!(text_runs(engine.state())?, vec![("abcxy".to_owned(), None)]);
    assert_exact_v3(&engine)?;
    Ok(())
}

#[test]
fn atomic_history_replay_sequences_are_exact_and_stale_safe() -> TestResult {
    let mut engine = CheckpointedEditorEngine::try_new_v3(
        typed_engine(DocumentLimits::default(), collapsed(3)?, "engine-v3-replay-sequence")?,
        SessionCheckpointLimits::default(),
    )?;
    let initial = engine.observation();
    let inserted = engine.execute_action(&initial, &insert("x")?)?;
    assert!(matches!(inserted, EditorActionOutcome::Committed(_)));
    let before_undo = engine.observation();
    let undo = engine.undo_after_closing_history_group(&before_undo)?;
    assert!(undo.boundary().is_some());
    assert!(matches!(
        undo.command().as_ref().map(breditor_core::engine::EditorEngineEvent::kind),
        Some(EditorEngineEventKind::Undo)
    ));
    assert_eq!(text_runs(engine.state())?, vec![("abc".to_owned(), None)]);
    assert_exact_v3(&engine)?;

    let before_redo = engine.observation();
    let redo = engine.redo_after_closing_history_group(&before_redo)?;
    assert!(redo.boundary().is_none());
    assert!(matches!(
        redo.command().as_ref().map(breditor_core::engine::EditorEngineEvent::kind),
        Some(EditorEngineEventKind::Redo)
    ));
    assert_eq!(text_runs(engine.state())?, vec![("abcx".to_owned(), None)]);
    assert_exact_v3(&engine)?;

    let current = engine.observation();
    let current_state = engine.state().clone();
    let current_history = engine.session().history_status();
    let current_checkpoint = engine.session_checkpoint_json().to_owned();
    assert!(engine.redo_after_closing_history_group(&before_redo).is_err());
    assert_eq!(engine.state(), &current_state);
    assert_eq!(engine.session().history_status(), current_history);
    assert_eq!(engine.observation(), current);
    assert_eq!(engine.session_checkpoint_json(), current_checkpoint);

    let unavailable = engine.redo_after_closing_history_group(&current)?;
    assert!(unavailable.boundary().is_none());
    assert!(unavailable.command().is_none());
    assert_eq!(engine.observation(), current);
    assert_eq!(engine.session_checkpoint_json(), current_checkpoint);
    Ok(())
}

#[test]
fn v3_output_limit_rejects_typed_pending_change_before_publication() -> TestResult {
    let private_url = format!("https://example.test/{}", "private".repeat(48));
    let mut baseline = CheckpointedEditorEngine::try_new_v3(
        typed_engine(DocumentLimits::default(), collapsed(3)?, "engine-v3-output")?,
        SessionCheckpointLimits::default(),
    )?;
    let initial_bytes = baseline.session_checkpoint_json().len();
    let observation = baseline.observation();
    let _ = baseline.execute_action(&observation, &set_href(&private_url)?)?;
    let expanded_bytes = baseline.session_checkpoint_json().len();
    assert!(expanded_bytes > initial_bytes);

    let maximum = expanded_bytes
        .checked_sub(1)
        .ok_or_else(|| io::Error::other("expanded V3 checkpoint was empty"))?;
    assert!(maximum >= initial_bytes);
    let mut engine = CheckpointedEditorEngine::try_new_v3(
        typed_engine(
            DocumentLimits::default().with_max_json_bytes(maximum),
            collapsed(3)?,
            "engine-v3-output",
        )?,
        SessionCheckpointLimits::default(),
    )?;
    let before_state = engine.state().clone();
    let before_history = engine.session().history_status();
    let before_observation = engine.observation();
    let before_checkpoint = engine.session_checkpoint_json().to_owned();
    let error = require_checkpoint_error(
        engine.execute_action(&before_observation, &set_href(&private_url)?),
    )?;

    assert_eq!(error.code(), CheckpointedEditorEngineErrorCode::SessionCheckpointRepresentation);
    assert_eq!(error.checkpoint_codec_code(), Some(CodecErrorCode::OutputTooLarge));
    assert_eq!(engine.state(), &before_state);
    assert_eq!(engine.session().history_status(), before_history);
    assert_eq!(engine.observation(), before_observation);
    assert_eq!(engine.session_checkpoint_json(), before_checkpoint);
    assert!(!format!("{error:?}").contains(&private_url));
    Ok(())
}

#[test]
fn v3_output_limit_rolls_back_history_close_and_typed_command_together() -> TestResult {
    let private_url = format!("https://example.test/{}", "private".repeat(48));
    let mut baseline = CheckpointedEditorEngine::try_new_v3(
        typed_engine(DocumentLimits::default(), collapsed(3)?, "engine-v3-atomic-output")?,
        SessionCheckpointLimits::default(),
    )?;
    let initial = baseline.observation();
    let _ = baseline.execute_action(&initial, &insert("x")?)?;
    let open_bytes = baseline.session_checkpoint_json().len();
    let before_sequence = baseline.observation();
    let sequence = baseline
        .execute_action_after_closing_history_group(&before_sequence, &set_href(&private_url)?)?;
    assert!(sequence.boundary().is_some());
    let expanded_bytes = baseline.session_checkpoint_json().len();
    assert!(expanded_bytes > open_bytes);

    let maximum = expanded_bytes
        .checked_sub(1)
        .ok_or_else(|| io::Error::other("expanded V3 checkpoint was empty"))?;
    assert!(maximum >= open_bytes);
    let mut engine = CheckpointedEditorEngine::try_new_v3(
        typed_engine(
            DocumentLimits::default().with_max_json_bytes(maximum),
            collapsed(3)?,
            "engine-v3-atomic-output",
        )?,
        SessionCheckpointLimits::default(),
    )?;
    let initial = engine.observation();
    let _ = engine.execute_action(&initial, &insert("x")?)?;
    let before_state = engine.state().clone();
    let before_history = engine.session().history_status();
    let before_observation = engine.observation();
    let before_checkpoint = engine.session_checkpoint_json().to_owned();
    let error = require_checkpoint_error(engine.execute_action_after_closing_history_group(
        &before_observation,
        &set_href(&private_url)?,
    ))?;

    assert_eq!(error.code(), CheckpointedEditorEngineErrorCode::SessionCheckpointRepresentation);
    assert_eq!(error.checkpoint_codec_code(), Some(CodecErrorCode::OutputTooLarge));
    assert_eq!(engine.state(), &before_state);
    assert_eq!(engine.session().history_status(), before_history);
    assert_eq!(engine.observation(), before_observation);
    assert_eq!(engine.session_checkpoint_json(), before_checkpoint);
    assert!(!format!("{error:?}").contains(&private_url));
    assert!(engine.close_history_group(&before_observation)?.is_some());
    Ok(())
}

#[test]
fn v3_retained_property_budget_rejects_content_change_before_publication() -> TestResult {
    const PRIVATE_URL: &str = "https://private.example.test/retained-budget";
    let limits = SessionCheckpointLimits::default().with_max_retained_property_values(0);
    let raw = typed_engine(DocumentLimits::default(), selected_all()?, "engine-v3-retained")?;
    let mut engine = CheckpointedEditorEngine::try_new_v3(raw, limits)?;
    let before_state = engine.state().clone();
    let before_history = engine.session().history_status();
    let before_observation = engine.observation();
    let before_checkpoint = engine.session_checkpoint_json().to_owned();
    let error = require_checkpoint_error(
        engine.execute_action(&before_observation, &set_href(PRIVATE_URL)?),
    )?;

    assert_eq!(error.code(), CheckpointedEditorEngineErrorCode::SessionCheckpointRepresentation);
    assert_eq!(error.checkpoint_codec_code(), Some(CodecErrorCode::ResourceLimit));
    assert_eq!(engine.state(), &before_state);
    assert_eq!(engine.session().history_status(), before_history);
    assert_eq!(engine.observation(), before_observation);
    assert_eq!(engine.session_checkpoint_json(), before_checkpoint);
    assert!(!format!("{error:?}").contains(PRIVATE_URL));
    Ok(())
}

fn base_engine(lineage: &str) -> TestResult<EditorEngine> {
    let context = EditorContext::default();
    let source = json!({
        "format": "breditor/document",
        "formatVersion": 1,
        "schema": {"name": "breditor/base", "version": 1},
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
    let document = DocumentJsonCodec::new(context.schema().clone()).decode(&source)?;
    let state = EditorState::try_new(
        &context,
        LineageId::try_new(lineage)?,
        document,
        Some(collapsed(3)?),
        None,
    )?;
    EditorEngine::try_with_base_actions(EditorSession::new(state)).map_err(Into::into)
}

#[test]
fn explicit_v1_and_v2_constructors_keep_their_existing_wire_policies() -> TestResult {
    let v1 = CheckpointedEditorEngine::try_new(
        base_engine("engine-v3-legacy-v1")?,
        SessionCheckpointLimits::default(),
    )?;
    assert_eq!(v1.session_checkpoint_format_version(), SESSION_CHECKPOINT_FORMAT_VERSION);
    let expected_v1 = SessionCheckpointJsonCodec::new(v1.state().context().clone())
        .with_limits(*v1.session_checkpoint_limits())
        .encode(v1.session())?;
    assert_eq!(v1.session_checkpoint_json(), expected_v1);

    let v2 = CheckpointedEditorEngine::try_new_v2(
        base_engine("engine-v3-legacy-v2")?,
        SessionCheckpointLimits::default(),
    )?;
    assert_eq!(v2.session_checkpoint_format_version(), SESSION_CHECKPOINT_V2_FORMAT_VERSION);
    let expected_v2 = SessionCheckpointJsonCodecV2::new(v2.state().context().clone())
        .with_limits(*v2.session_checkpoint_limits())
        .encode(v2.session())?;
    assert_eq!(v2.session_checkpoint_json(), expected_v2);
    Ok(())
}

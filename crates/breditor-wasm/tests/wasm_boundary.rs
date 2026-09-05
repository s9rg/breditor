//! Black-box native and Wasm smoke contracts for the narrow boundary.

use std::{error::Error, io};

use breditor_core::{
    codec::{DocumentJsonCodec, EditorStateJsonCodec, SessionCheckpointJsonCodec},
    position::{Affinity, NodePath, Point},
    selection::{RangeSelection, Selection},
    session::EditorSession,
    state::{EditorContext, EditorState, LineageId},
};
use breditor_wasm::{
    BreditorCommandResult, BreditorEngine, BreditorEngineResult, BreditorObservation,
    BreditorStringResult, breditor_version, breditor_wasm_abi_version,
};
use serde_json::Value;
#[cfg(target_arch = "wasm32")]
use wasm_bindgen_test::wasm_bindgen_test;

type TestResult<T = ()> = Result<T, Box<dyn Error>>;

const EMPTY_DOCUMENT_JSON: &str = r#"{
  "format":"breditor/document","formatVersion":1,
  "schema":{"name":"breditor/base","version":1},
  "root":{"kind":"element","type":"breditor/document","entityId":null,"properties":{},
    "children":[{"kind":"element","type":"breditor/paragraph","entityId":null,
      "properties":{},"children":[]}]}
}"#;

const TEXT_DOCUMENT_JSON: &str = r#"{
  "format":"breditor/document","formatVersion":1,
  "schema":{"name":"breditor/base","version":1},
  "root":{"kind":"element","type":"breditor/document","entityId":null,"properties":{},
    "children":[{"kind":"element","type":"breditor/paragraph","entityId":null,
      "properties":{},"children":[{"kind":"text","text":"a","formats":[]}]}]}
}"#;

#[cfg_attr(target_arch = "wasm32", wasm_bindgen_test)]
#[cfg_attr(not(target_arch = "wasm32"), test)]
fn factory_observation_and_json_reads_are_structured() -> TestResult {
    assert_eq!(breditor_wasm_abi_version(), "1");
    assert_eq!(breditor_version(), env!("CARGO_PKG_VERSION"));
    let mut result = BreditorEngine::from_document_json("wasm-factory", EMPTY_DOCUMENT_JSON, 100.0);
    assert_eq!(result.status(), "engine");
    assert!(result.error().is_none());
    let engine = require_engine(&mut result)?;
    assert_eq!(result.status(), "taken");
    assert!(result.take_engine().is_none());

    let observation = engine.observation();
    assert_eq!(observation.snapshot_lineage(), "wasm-factory");
    assert_eq!(observation.snapshot_revision(), "0");
    assert_eq!(observation.history_capacity(), 100);
    assert_eq!(observation.undo_depth(), 0);
    assert_eq!(observation.redo_depth(), 0);
    assert!(!observation.can_undo());
    assert!(!observation.can_redo());

    let mut state = engine.state_json();
    assert_eq!(state.status(), "value");
    let state_json = state.take_value().ok_or_else(|| test_error("state JSON was absent"))?;
    assert_eq!(state.status(), "taken");
    assert!(state_json.contains("\"format\":\"breditor/editor-state\""));

    let mut checkpoint = engine.session_checkpoint_json();
    assert_eq!(checkpoint.status(), "value");
    let checkpoint_json =
        checkpoint.take_value().ok_or_else(|| test_error("checkpoint JSON was absent"))?;
    assert!(checkpoint_json.contains("\"format\":\"breditor/session-checkpoint\""));
    Ok(())
}

#[cfg_attr(target_arch = "wasm32", wasm_bindgen_test)]
#[cfg_attr(not(target_arch = "wasm32"), test)]
fn factory_failures_are_stable_and_redacted() -> TestResult {
    const PRIVATE_INPUT: &str = "private-invalid-document-payload";
    let invalid_lineage =
        BreditorEngine::from_document_json("/invalid", EMPTY_DOCUMENT_JSON, 100.0);
    assert_engine_error(&invalid_lineage, "breditor_wasm.invalid_lineage", PRIVATE_INPUT)?;

    for capacity in
        [1.5, -1.0, f64::NAN, f64::INFINITY, f64::NEG_INFINITY, 101.0, 10_000.0, 4_294_967_296.0]
    {
        let invalid = BreditorEngine::from_document_json("capacity", EMPTY_DOCUMENT_JSON, capacity);
        assert_engine_error(&invalid, "breditor_wasm.invalid_history_capacity", PRIVATE_INPUT)?;
    }

    let invalid_document = BreditorEngine::from_document_json("invalid-doc", PRIVATE_INPUT, 100.0);
    assert_engine_error(&invalid_document, "codec.invalid_json", PRIVATE_INPUT)?;

    for (capacity, expected) in [(-0.0, 0), (0.0, 0), (100.0, 100)] {
        let mut valid =
            BreditorEngine::from_document_json("capacity-valid", EMPTY_DOCUMENT_JSON, capacity);
        assert_eq!(valid.status(), "engine");
        let engine = require_engine(&mut valid)?;
        assert_eq!(engine.observation().history_capacity(), expected);
        assert_eq!(valid.status(), "taken");
    }
    Ok(())
}

#[cfg_attr(target_arch = "wasm32", wasm_bindgen_test)]
#[cfg_attr(not(target_arch = "wasm32"), test)]
fn disabled_and_unchanged_outcomes_carry_current_observations() -> TestResult {
    let mut result = BreditorEngine::from_document_json("wasm-noops", EMPTY_DOCUMENT_JSON, 100.0);
    let mut engine = require_engine(&mut result)?;
    let initial = engine.observation();

    let disabled = engine.execute_no_input_action(&initial, "breditor/toggle-strong");
    assert_eq!(disabled.status(), "disabled");
    assert_eq!(disabled.disabled_action_id().as_deref(), Some("breditor/toggle-strong"));
    assert_eq!(disabled.disabled_reason_code().as_deref(), Some("breditor/no-selection"));
    assert_eq!(disabled.activation().as_deref(), Some("inactive"));
    assert_eq!(disabled.indicator_value_status().as_deref(), Some("unsupported"));
    assert!(disabled.error().is_none());
    assert_eq!(disabled.event_kind(), None);
    assert_eq!(disabled.commit_json().status(), "absent");
    let after_disabled = require_observation(&disabled)?;
    assert_eq!(after_disabled.snapshot_revision(), "0");

    let undo = engine.undo(&after_disabled);
    assert_eq!(undo.status(), "unchanged");
    assert_eq!(undo.event_kind(), None);
    assert!(undo.error().is_none());
    assert!(undo.disabled_action_id().is_none());
    assert_eq!(undo.commit_json().status(), "absent");
    let after_undo = require_observation(&undo)?;
    let clear = engine.clear_history(&after_undo);
    assert_eq!(clear.status(), "unchanged");
    assert!(clear.observation().is_some());
    Ok(())
}

#[cfg_attr(target_arch = "wasm32", wasm_bindgen_test)]
#[cfg_attr(not(target_arch = "wasm32"), test)]
fn string_action_commit_replay_and_stale_guards_are_preserved() -> TestResult {
    const PRIVATE_INPUT: &str = "private-wasm-action";
    let checkpoint = selected_checkpoint("wasm-action")?;
    let mut result = BreditorEngine::from_session_checkpoint_json(&checkpoint);
    let mut engine = require_engine(&mut result)?;
    let initial = engine.observation();

    let committed = engine.execute_string_action(&initial, "breditor/insert-text", PRIVATE_INPUT);
    assert_eq!(committed.status(), "committed");
    assert_eq!(committed.event_kind().as_deref(), Some("action"));
    assert!(committed.error().is_none());
    assert!(committed.disabled_action_id().is_none());
    let commit = committed.commit_json();
    assert_eq!(commit.status(), "value");
    assert!(commit.value().is_some_and(|json| json.contains("\"format\":\"breditor/commit\"")));
    let after_insert = require_observation(&committed)?;
    assert_eq!(after_insert.snapshot_revision(), "1");
    assert_eq!(after_insert.undo_depth(), 1);

    let stale = engine.execute_no_input_action(&initial, "not even an action ID");
    assert_command_error(&stale, "editor_engine.stale_snapshot", PRIVATE_INPUT)?;

    let undo = engine.undo(&after_insert);
    assert_eq!(undo.status(), "committed");
    assert_eq!(undo.event_kind().as_deref(), Some("undo"));
    let after_undo = require_observation(&undo)?;
    assert_eq!(after_undo.snapshot_revision(), "2");
    assert_eq!(after_undo.redo_depth(), 1);

    let redo = engine.redo(&after_undo);
    assert_eq!(redo.status(), "committed");
    assert_eq!(redo.event_kind().as_deref(), Some("redo"));
    assert_eq!(redo.observation().map(|value| value.snapshot_revision()).as_deref(), Some("3"));
    Ok(())
}

#[cfg_attr(target_arch = "wasm32", wasm_bindgen_test)]
#[cfg_attr(not(target_arch = "wasm32"), test)]
fn action_shape_errors_are_adapter_owned_and_atomic() -> TestResult {
    let checkpoint = selected_checkpoint("wasm-shape")?;
    let mut result = BreditorEngine::from_session_checkpoint_json(&checkpoint);
    let mut engine = require_engine(&mut result)?;
    let observation = engine.observation();

    let missing = engine.execute_no_input_action(&observation, "test/missing");
    assert_command_error(&missing, "breditor_wasm.unknown_action", "missing")?;
    let malformed = engine.execute_no_input_action(&observation, "MALFORMED");
    assert_command_error(&malformed, "breditor_wasm.invalid_action_id", "MALFORMED")?;
    let needs_string = engine.execute_no_input_action(&observation, "breditor/insert-text");
    assert_command_error(
        &needs_string,
        "breditor_wasm.action_requires_string_input",
        "insert-text",
    )?;
    let rejects_string =
        engine.execute_string_action(&observation, "breditor/toggle-strong", "private");
    assert_command_error(&rejects_string, "breditor_wasm.action_rejects_string_input", "private")?;
    let too_large = "x".repeat(65_537);
    let limited = engine.execute_string_action(&observation, "breditor/insert-text", &too_large);
    assert_command_error(&limited, "breditor_wasm.string_input_limit", &too_large)?;
    assert_eq!(engine.observation().snapshot_revision(), "0");
    Ok(())
}

#[cfg_attr(target_arch = "wasm32", wasm_bindgen_test)]
#[cfg_attr(not(target_arch = "wasm32"), test)]
fn known_string_value_rejections_keep_precise_safe_codes_and_are_atomic() -> TestResult {
    let checkpoint = selected_checkpoint("wasm-value-errors")?;
    let mut result = BreditorEngine::from_session_checkpoint_json(&checkpoint);
    let mut engine = require_engine(&mut result)?;
    let observation = engine.observation();

    let empty = engine.execute_string_action(&observation, "breditor/insert-text", "");
    assert_command_error(&empty, "breditor/insert-text-input-empty", "private")?;

    let too_many_paragraphs = format!("private-paragraph\n{}", "\n".repeat(9_999));
    let paragraph_limit = engine.execute_string_action(
        &observation,
        "breditor/insert-plain-text",
        &too_many_paragraphs,
    );
    assert_command_error(
        &paragraph_limit,
        "breditor/insert-plain-text-paragraph-limit",
        "private-paragraph",
    )?;

    assert_eq!(engine.observation().snapshot_revision(), "0");
    let valid = engine.execute_string_action(&observation, "breditor/insert-text", "valid");
    assert_eq!(valid.status(), "committed");
    assert_eq!(require_observation(&valid)?.snapshot_revision(), "1");
    Ok(())
}

#[cfg_attr(target_arch = "wasm32", wasm_bindgen_test)]
#[cfg_attr(not(target_arch = "wasm32"), test)]
fn history_only_publication_rotates_the_hidden_guard_at_the_same_revision() -> TestResult {
    let checkpoint = selected_checkpoint("wasm-stale-history")?;
    let mut result = BreditorEngine::from_session_checkpoint_json(&checkpoint);
    let mut engine = require_engine(&mut result)?;
    let initial = engine.observation();

    let inserted = engine.execute_string_action(&initial, "breditor/insert-text", "b");
    let before_close = require_observation(&inserted)?;
    assert_eq!(before_close.snapshot_revision(), "1");
    assert_eq!(before_close.undo_depth(), 1);

    let closed = engine.close_history_group(&before_close);
    assert_eq!(closed.status(), "committed");
    assert_eq!(closed.event_kind().as_deref(), Some("closeHistoryGroup"));
    assert_eq!(closed.commit_json().status(), "absent");
    let after_close = require_observation(&closed)?;
    assert_eq!(after_close.snapshot_revision(), before_close.snapshot_revision());
    assert_eq!(after_close.undo_depth(), before_close.undo_depth());
    assert_eq!(after_close.redo_depth(), before_close.redo_depth());

    let stale = engine.execute_no_input_action(&before_close, "not even an action ID");
    assert_command_error(&stale, "editor_engine.stale_history", "not even an action ID")?;
    let current = engine.observation();
    assert_eq!(current.snapshot_revision(), "1");
    assert_eq!(current.undo_depth(), 1);
    Ok(())
}

#[cfg_attr(target_arch = "wasm32", wasm_bindgen_test)]
#[cfg_attr(not(target_arch = "wasm32"), test)]
fn plain_text_action_and_effective_history_clear_cross_the_boundary() -> TestResult {
    let checkpoint = selected_checkpoint("wasm-plain-text-clear")?;
    let mut result = BreditorEngine::from_session_checkpoint_json(&checkpoint);
    let mut engine = require_engine(&mut result)?;
    let initial = engine.observation();

    let inserted =
        engine.execute_string_action(&initial, "breditor/insert-plain-text", "first\nsecond");
    assert_eq!(inserted.status(), "committed");
    assert_eq!(inserted.event_kind().as_deref(), Some("action"));
    let after_insert = require_observation(&inserted)?;
    assert_eq!(after_insert.snapshot_revision(), "1");
    assert_eq!(after_insert.undo_depth(), 1);
    let encoded_state = require_string(engine.state_json())?;
    assert!(encoded_state.contains(r#""text":"afirst""#));
    assert!(encoded_state.contains(r#""text":"second""#));

    let cleared = engine.clear_history(&after_insert);
    assert_eq!(cleared.status(), "committed");
    assert_eq!(cleared.event_kind().as_deref(), Some("clearHistory"));
    assert_eq!(cleared.commit_json().status(), "absent");
    let after_clear = require_observation(&cleared)?;
    assert_eq!(after_clear.snapshot_revision(), "1");
    assert_eq!(after_clear.undo_depth(), 0);
    assert_eq!(after_clear.redo_depth(), 0);

    let stale = engine.undo(&after_insert);
    assert_command_error(&stale, "editor_engine.stale_history", "first\nsecond")?;
    let unchanged = engine.undo(&after_clear);
    assert_eq!(unchanged.status(), "unchanged");
    Ok(())
}

#[cfg_attr(target_arch = "wasm32", wasm_bindgen_test)]
#[cfg_attr(not(target_arch = "wasm32"), test)]
fn full_width_revision_is_exposed_only_as_canonical_decimal_text() -> TestResult {
    let checkpoint = checkpoint_at_revision("wasm-max-revision", u64::MAX)?;
    let mut result = BreditorEngine::from_session_checkpoint_json(&checkpoint);
    let engine = require_engine(&mut result)?;

    let observation = engine.observation();
    assert_eq!(observation.snapshot_revision(), "18446744073709551615");
    let exported = require_string(engine.session_checkpoint_json())?;
    let record: Value = serde_json::from_str(&exported)?;
    assert_eq!(record["currentRevision"], "18446744073709551615");
    Ok(())
}

#[cfg_attr(target_arch = "wasm32", wasm_bindgen_test)]
#[cfg_attr(not(target_arch = "wasm32"), test)]
fn equivalent_replays_produce_byte_identical_commit_state_and_checkpoint_json() -> TestResult {
    let checkpoint = selected_checkpoint("wasm-deterministic")?;
    let first = deterministic_sequence(&checkpoint)?;
    let second = deterministic_sequence(&checkpoint)?;
    assert_eq!(first, second);
    Ok(())
}

#[cfg_attr(target_arch = "wasm32", wasm_bindgen_test)]
#[cfg_attr(not(target_arch = "wasm32"), test)]
fn checkpoint_restore_allocates_a_fresh_engine_identity() -> TestResult {
    let checkpoint = selected_checkpoint("wasm-restore")?;
    let mut first_result = BreditorEngine::from_session_checkpoint_json(&checkpoint);
    let mut first = require_engine(&mut first_result)?;
    let first_observation = first.observation();
    let mut encoded = first.session_checkpoint_json();
    let encoded = encoded.take_value().ok_or_else(|| test_error("checkpoint export failed"))?;
    let mut second_result = BreditorEngine::from_session_checkpoint_json(&encoded);
    let mut second = require_engine(&mut second_result)?;

    let cross_engine = second.undo(&first_observation);
    assert_command_error(&cross_engine, "editor_engine.stale_engine", "wasm-restore")?;
    assert_eq!(second.observation().snapshot_revision(), "0");

    let current = first.observation();
    let first_undo = first.undo(&current);
    assert_eq!(first_undo.status(), "unchanged");
    Ok(())
}

fn selected_checkpoint(lineage: &str) -> TestResult<String> {
    let context = EditorContext::default();
    let document = DocumentJsonCodec::new(context.schema().clone())
        .with_limits(context.limits().clone())
        .decode(TEXT_DOCUMENT_JSON)?;
    let point = Point::Text {
        text_path: NodePath::try_from_indices(vec![0, 0])?,
        utf16_offset: 1,
        affinity: Affinity::After,
    };
    let selection: Selection = RangeSelection::new(point.clone(), point).into();
    let state = EditorState::try_new(
        &context,
        LineageId::try_new(lineage)?,
        document,
        Some(selection),
        None,
    )?;
    Ok(SessionCheckpointJsonCodec::new(context).encode(&EditorSession::new(state))?)
}

fn checkpoint_at_revision(lineage: &str, revision: u64) -> TestResult<String> {
    let context = EditorContext::default();
    let document = DocumentJsonCodec::new(context.schema().clone())
        .with_limits(context.limits().clone())
        .decode(TEXT_DOCUMENT_JSON)?;
    let initial =
        EditorState::try_new(&context, LineageId::try_new(lineage)?, document, None, None)?;
    let state_codec = EditorStateJsonCodec::new(context.clone());
    let mut record: Value = serde_json::from_str(&state_codec.encode(&initial)?)?;
    record["snapshot"]["revision"] = Value::String(revision.to_string());
    let state = state_codec.decode(&serde_json::to_string(&record)?)?;
    Ok(SessionCheckpointJsonCodec::new(context).encode(&EditorSession::new(state))?)
}

fn deterministic_sequence(checkpoint: &str) -> TestResult<(String, String, String)> {
    let mut result = BreditorEngine::from_session_checkpoint_json(checkpoint);
    let mut engine = require_engine(&mut result)?;
    let observation = engine.observation();
    let command =
        engine.execute_string_action(&observation, "breditor/insert-text", "deterministic");
    assert_eq!(command.status(), "committed");
    assert_eq!(require_observation(&command)?.snapshot_revision(), "1");
    Ok((
        require_string(command.commit_json())?,
        require_string(engine.state_json())?,
        require_string(engine.session_checkpoint_json())?,
    ))
}

fn require_engine(result: &mut BreditorEngineResult) -> TestResult<BreditorEngine> {
    result.take_engine().ok_or_else(|| test_error("engine result had no engine").into())
}

fn require_observation(result: &BreditorCommandResult) -> TestResult<BreditorObservation> {
    result.observation().ok_or_else(|| test_error("command result had no observation").into())
}

fn require_string(mut result: BreditorStringResult) -> TestResult<String> {
    assert_eq!(result.status(), "value");
    let value = result.take_value().ok_or_else(|| test_error("string result had no value"))?;
    assert_eq!(result.status(), "taken");
    Ok(value)
}

fn assert_engine_error(result: &BreditorEngineResult, code: &str, private: &str) -> TestResult {
    assert_eq!(result.status(), "error");
    let error = result.error().ok_or_else(|| test_error("engine result had no error"))?;
    assert_eq!(error.code(), code);
    assert!(!error.message().contains(private));
    Ok(())
}

fn assert_command_error(result: &BreditorCommandResult, code: &str, private: &str) -> TestResult {
    assert_eq!(result.status(), "error");
    assert!(result.observation().is_none());
    assert!(result.event_kind().is_none());
    assert!(result.disabled_action_id().is_none());
    assert_eq!(result.commit_json().status(), "absent");
    let error = result.error().ok_or_else(|| test_error("command result had no error"))?;
    assert_eq!(error.code(), code);
    assert!(!error.message().contains(private));
    Ok(())
}

fn test_error(message: impl Into<String>) -> io::Error {
    io::Error::other(message.into())
}

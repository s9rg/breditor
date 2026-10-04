//! Opt-in heading commands, JSON exports and fresh-owner recovery.
use crate::{BreditorCompiledProfile, BreditorEngine, BreditorStringResult};
use breditor_core::{
    codec::CommitJsonCodecV5,
    position::{Affinity, NodePath, Point},
    selection::{RangeSelection, Selection},
};
use serde_json::{Value, json};
use std::{error::Error, io};

type TestResult<T = ()> = Result<T, Box<dyn Error>>;
const BOOTSTRAP: &str = r#"{"format":"breditor/profile-bootstrap","formatVersion":3,"schema":{"name":"example/heading-bridge","version":1},"extensions":[]}"#;

fn string(mut result: BreditorStringResult) -> TestResult<String> {
    result.take_value().ok_or_else(|| io::Error::other("expected JSON value").into())
}
fn profile() -> TestResult<BreditorCompiledProfile> {
    let mut result = BreditorCompiledProfile::from_bootstrap_json_v3(BOOTSTRAP);
    assert_eq!(result.status(), "profile");
    result.take_profile().ok_or_else(|| io::Error::other("missing profile").into())
}
fn engine(profile: &BreditorCompiledProfile) -> TestResult<BreditorEngine> {
    let descriptor = profile.descriptor();
    let document = json!({
        "format":"breditor/document", "formatVersion":2,
        "schema":{"name":descriptor.schema_name(),"version":descriptor.schema_version()},
        "schemaFingerprint":descriptor.schema_fingerprint(),
        "root":{"kind":"element","type":"breditor/document","entityId":null,"properties":{},
            "children":[{"kind":"element","type":"breditor/heading","entityId":null,
                "properties":{"breditor/level":2},"children":[{"kind":"text","text":"abc","formats":[]}]}]}
    });
    let mut result =
        profile.create_engine_from_document_json_v5("heading-bridge", &document.to_string(), 20.0);
    assert_eq!(result.status(), "engine");
    result.take_engine().ok_or_else(|| io::Error::other("missing engine").into())
}
fn select(engine: &mut BreditorEngine, start: u32, end: u32) -> TestResult {
    let point = |offset| -> TestResult<Point> {
        Ok(Point::Text {
            text_path: NodePath::try_from_indices(vec![0, 0])?,
            utf16_offset: offset,
            affinity: Affinity::Before,
        })
    };
    let selection: Selection = RangeSelection::new(point(start)?, point(end)?).into();
    engine.inner.set_selection(engine.observation().inner(), Some(selection))?;
    Ok(())
}
fn document(engine: &BreditorEngine) -> TestResult<Value> {
    Ok(serde_json::from_str(&string(engine.document_json(&engine.observation()))?)?)
}
fn assert_commit(engine: &BreditorEngine, result: &crate::BreditorCommandResult) -> TestResult {
    assert_eq!(result.status(), "committed");
    let encoded = string(result.commit_json())?;
    let value: Value = serde_json::from_str(&encoded)?;
    assert_eq!(value["formatVersion"], 5);
    let decoded =
        CommitJsonCodecV5::new(engine.inner.state().context().clone()).decode(&encoded)?;
    assert_eq!(decoded.after(), engine.inner.state());
    Ok(())
}

#[test]
fn v5_heading_commands_export_replayable_commits_and_restore_both_history_branches() -> TestResult {
    let profile = profile()?;
    let mut engine = engine(&profile)?;
    select(&mut engine, 1, 1)?;
    let typed = engine.execute_string_action(
        &engine.observation(),
        "breditor/insert-text-block-text",
        "🙂",
        false,
    );
    assert_commit(&engine, &typed)?;
    let after_typing = engine.inner.state().clone();
    let pasted = engine.execute_string_action(
        &engine.observation(),
        "breditor/insert-text-block-plain-text",
        "x\r\ny",
        true,
    );
    assert_commit(&engine, &pasted)?;
    let after_paste = engine.inner.state().clone();
    let exported = document(&engine)?;
    assert_eq!(exported["formatVersion"], 2);
    assert_eq!(exported["root"]["children"][0]["properties"]["breditor/level"], 2);
    assert_eq!(exported["root"]["children"][1]["properties"]["breditor/level"], 2);
    let state: Value = serde_json::from_str(&string(engine.state_json())?)?;
    assert_eq!(state["formatVersion"], 3);
    let undone = engine.undo(&engine.observation(), false);
    assert_commit(&engine, &undone)?;
    assert_eq!(engine.inner.state().document(), after_typing.document());
    assert_eq!(engine.inner.state().selection(), after_typing.selection());
    let checkpoint = string(engine.session_checkpoint_json())?;
    let saved: Value = serde_json::from_str(&checkpoint)?;
    assert_eq!(saved["formatVersion"], 5);
    let old_observation = engine.observation();
    let mut restore = profile.create_engine_from_session_checkpoint_json_v5(&checkpoint);
    assert_eq!(restore.status(), "engine");
    let mut restored =
        restore.take_engine().ok_or_else(|| io::Error::other("missing restored engine"))?;
    assert_eq!(string(restored.session_checkpoint_json())?, checkpoint);
    assert_eq!(restored.redo(&old_observation, false).status(), "error");
    let redone = restored.redo(&restored.observation(), false);
    assert_commit(&restored, &redone)?;
    assert_eq!(restored.inner.state().document(), after_paste.document());
    assert_eq!(restored.inner.state().selection(), after_paste.selection());
    assert_eq!(restored.inner.state().pending_formats(), after_paste.pending_formats());
    let undo_again = restored.undo(&restored.observation(), false);
    assert_commit(&restored, &undo_again)?;
    assert_eq!(restored.inner.state().selection(), after_typing.selection());
    Ok(())
}

#[test]
fn heading_and_inline_commands_use_explicit_profile_ids_and_export_commit_v5() -> TestResult {
    let profile = profile()?;
    let mut engine = engine(&profile)?;
    select(&mut engine, 0, 3)?;
    let kind =
        engine.execute_no_input_action(&engine.observation(), "breditor/set-heading-3", false);
    assert_commit(&engine, &kind)?;
    assert_eq!(document(&engine)?["root"]["children"][0]["properties"]["breditor/level"], 3);
    let strong = engine.execute_no_input_action(
        &engine.observation(),
        "breditor/toggle-text-block-strong",
        false,
    );
    assert_commit(&engine, &strong)?;
    let before = string(engine.session_checkpoint_json())?;
    let legacy =
        engine.execute_string_action(&engine.observation(), "breditor/insert-text", "no", false);
    assert_eq!(legacy.status(), "error");
    assert_eq!(string(engine.session_checkpoint_json())?, before);
    Ok(())
}

#[test]
fn explicit_bootstrap_and_session_versions_reject_fallback() -> TestResult {
    assert_eq!(BreditorCompiledProfile::from_bootstrap_json_v2(BOOTSTRAP).status(), "error");
    let v2 = BOOTSTRAP.replace("\"formatVersion\":3", "\"formatVersion\":2");
    assert_eq!(BreditorCompiledProfile::from_bootstrap_json_v3(&v2).status(), "error");
    assert_eq!(BreditorCompiledProfile::from_bootstrap_json_v2(&v2).status(), "profile");
    let profile = profile()?;
    let engine = engine(&profile)?;
    let mut saved: Value = serde_json::from_str(&string(engine.session_checkpoint_json())?)?;
    saved["formatVersion"] = json!(3);
    assert_eq!(
        profile.create_engine_from_session_checkpoint_json_v5(&saved.to_string()).status(),
        "error"
    );
    assert_eq!(
        profile.create_engine_from_document_json_v5("bad lineage!", "{}", 1.0).status(),
        "error"
    );
    assert_eq!(profile.create_engine_from_document_json_v5("valid", "{}", 0.5).status(), "error");
    Ok(())
}

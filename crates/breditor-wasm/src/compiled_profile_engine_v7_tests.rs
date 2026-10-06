//! Opt-in list commands, JSON exports and fresh-owner recovery.
use crate::{BreditorCompiledProfile, BreditorEngine, BreditorStringResult};
use breditor_core::{
    codec::CommitJsonCodecV7,
    position::{Affinity, NodePath, Point},
    selection::{RangeSelection, Selection},
};
use serde_json::{Value, json};
use std::{error::Error, io};

type TestResult<T = ()> = Result<T, Box<dyn Error>>;
const BOOTSTRAP: &str = r#"{"format":"breditor/profile-bootstrap","formatVersion":5,"schema":{"name":"example/list-bridge","version":1},"extensions":[]}"#;

fn string(mut result: BreditorStringResult) -> TestResult<String> {
    result.take_value().ok_or_else(|| io::Error::other("expected JSON value").into())
}
fn profile() -> TestResult<BreditorCompiledProfile> {
    let mut result = BreditorCompiledProfile::from_bootstrap_json_v5(BOOTSTRAP);
    assert_eq!(result.status(), "profile");
    result.take_profile().ok_or_else(|| io::Error::other("missing profile").into())
}
fn engine(profile: &BreditorCompiledProfile) -> TestResult<BreditorEngine> {
    let descriptor = profile.descriptor();
    let mut document = json!({
        "format":"breditor/document", "formatVersion":2,
        "schema":{"name":descriptor.schema_name(),"version":descriptor.schema_version()},
        "schemaFingerprint":descriptor.schema_fingerprint(),
        "root":{"kind":"element","type":"breditor/document","entityId":null,"properties":{},
            "children":[{"kind":"element","type":"breditor/heading","entityId":null,
                "properties":{"breditor/level":2},"children":[{"kind":"text","text":"abc","formats":[]}]}]}
    });
    let heading = document["root"]["children"][0].clone();
    document["root"]["children"] = json!([{"kind":"element","type":"breditor/ordered-list","entityId":null,"properties":{"breditor/start":8},"children":[{"kind":"element","type":"breditor/list-item","entityId":null,"properties":{},"children":[heading]}]}]);
    let inner_list = document["root"]["children"][0].clone();
    document["root"]["children"] = json!([{"kind":"element","type":"breditor/bullet-list","entityId":null,"properties":{},"children":[
        {"kind":"element","type":"breditor/list-item","entityId":null,"properties":{},"children":[
            {"kind":"element","type":"breditor/paragraph","entityId":null,"properties":{},"children":[]}, inner_list]}]}]);
    let mut result =
        profile.create_engine_from_document_json_v7("list-bridge", &document.to_string(), 20.0);
    assert_eq!(result.status(), "engine");
    result.take_engine().ok_or_else(|| io::Error::other("missing engine").into())
}
fn select(engine: &mut BreditorEngine, start: u32, end: u32) -> TestResult {
    let point = |offset| -> TestResult<Point> {
        Ok(Point::Text {
            text_path: NodePath::try_from_indices(vec![0, 0, 1, 0, 0, 0])?,
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
    assert_eq!(value["formatVersion"], 7);
    let decoded =
        CommitJsonCodecV7::new(engine.inner.state().context().clone()).decode(&encoded)?;
    assert_eq!(decoded.after(), engine.inner.state());
    Ok(())
}

#[test]
fn nested_bridge_typing_paste_exports_and_fresh_owner_recovery() -> TestResult {
    let profile = profile()?;
    let mut e = engine(&profile)?;
    select(&mut e, 1, 1)?;
    let typed =
        e.execute_string_action(&e.observation(), "breditor/insert-nested-list-text", "🙂", false);
    assert_commit(&e, &typed)?;
    let after_typing = e.inner.state().clone();
    let pasted = e.execute_string_action(
        &e.observation(),
        "breditor/insert-nested-list-plain-text",
        "x\r\ny",
        true,
    );
    assert_commit(&e, &pasted)?;
    let after_paste = e.inner.state().clone();
    let exported = document(&e)?;
    assert_eq!(exported["formatVersion"], 2);
    let nested = &exported["root"]["children"][0]["children"][0]["children"][1];
    assert_eq!(nested["properties"]["breditor/start"], 8);
    assert_eq!(nested["children"].as_array().ok_or("items")?.len(), 2);
    assert_eq!(serde_json::from_str::<Value>(&string(e.state_json())?)?["formatVersion"], 3);
    let undone = e.undo(&e.observation(), false);
    assert_commit(&e, &undone)?;
    assert_eq!(e.inner.state().document(), after_typing.document());
    let checkpoint = string(e.session_checkpoint_json())?;
    assert_eq!(serde_json::from_str::<Value>(&checkpoint)?["formatVersion"], 7);
    let other = self::profile()?;
    let mut result = other.create_engine_from_session_checkpoint_json_v7(&checkpoint);
    assert_eq!(result.status(), "engine");
    let mut restored = result.take_engine().ok_or("engine")?;
    assert_eq!(string(restored.session_checkpoint_json())?, checkpoint);
    assert_eq!(restored.redo(&e.observation(), false).status(), "error");
    let redone = restored.redo(&restored.observation(), false);
    assert_commit(&restored, &redone)?;
    assert_eq!(restored.inner.state().document(), after_paste.document());
    assert_eq!(restored.inner.state().selection(), after_paste.selection());
    assert_eq!(other.create_engine_from_session_checkpoint_json_v6(&checkpoint).status(), "error");
    Ok(())
}

#[test]
fn nested_bootstrap_version_is_explicit() {
    assert_eq!(BreditorCompiledProfile::from_bootstrap_json_v4(BOOTSTRAP).status(), "error");
    assert_eq!(
        BreditorCompiledProfile::from_bootstrap_json_v5(
            &BOOTSTRAP.replace("\"formatVersion\":5", "\"formatVersion\":4")
        )
        .status(),
        "error"
    );
}

#[test]
fn nested_intent_commit_exports_v7() -> TestResult {
    let p = profile()?;
    let mut e = engine(&p)?;
    select(&mut e, 1, 1)?;
    let result = e.execute_no_input_intent(&e.observation(), "breditor/outdent-list-items", true);
    let encoded = string(result.commit_json())?;
    assert_eq!(serde_json::from_str::<Value>(&encoded)?["formatVersion"], 7);
    let decoded = CommitJsonCodecV7::new(e.inner.state().context().clone()).decode(&encoded)?;
    assert_eq!(decoded.after(), e.inner.state());
    Ok(())
}

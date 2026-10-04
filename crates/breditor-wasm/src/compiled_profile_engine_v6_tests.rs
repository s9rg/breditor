//! Opt-in list commands, JSON exports and fresh-owner recovery.
use crate::{BreditorCompiledProfile, BreditorEngine, BreditorStringResult};
use breditor_core::{
    codec::CommitJsonCodecV6,
    position::{Affinity, NodePath, Point},
    selection::{RangeSelection, Selection},
};
use serde_json::{Value, json};
use std::{error::Error, io};

type TestResult<T = ()> = Result<T, Box<dyn Error>>;
const BOOTSTRAP: &str = r#"{"format":"breditor/profile-bootstrap","formatVersion":4,"schema":{"name":"example/list-bridge","version":1},"extensions":[]}"#;

fn string(mut result: BreditorStringResult) -> TestResult<String> {
    result.take_value().ok_or_else(|| io::Error::other("expected JSON value").into())
}
fn profile() -> TestResult<BreditorCompiledProfile> {
    let mut result = BreditorCompiledProfile::from_bootstrap_json_v4(BOOTSTRAP);
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
    let mut result =
        profile.create_engine_from_document_json_v6("list-bridge", &document.to_string(), 20.0);
    assert_eq!(result.status(), "engine");
    result.take_engine().ok_or_else(|| io::Error::other("missing engine").into())
}
fn select(engine: &mut BreditorEngine, start: u32, end: u32) -> TestResult {
    let point = |offset| -> TestResult<Point> {
        Ok(Point::Text {
            text_path: NodePath::try_from_indices(vec![0, 0, 0, 0])?,
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
    assert_eq!(value["formatVersion"], 6);
    let decoded =
        CommitJsonCodecV6::new(engine.inner.state().context().clone()).decode(&encoded)?;
    assert_eq!(decoded.after(), engine.inner.state());
    Ok(())
}

#[test]
fn list_typing_paste_exports_and_fresh_owner_redo_are_exact() -> TestResult {
    let profile = profile()?;
    let mut e = engine(&profile)?;
    select(&mut e, 1, 1)?;
    let typed =
        e.execute_string_action(&e.observation(), "breditor/insert-flat-list-text", "🙂", false);
    assert_commit(&e, &typed)?;
    let after_typing = e.inner.state().clone();
    let pasted = e.execute_string_action(
        &e.observation(),
        "breditor/insert-flat-list-plain-text",
        "x\r\ny",
        true,
    );
    assert_commit(&e, &pasted)?;
    let after_paste = e.inner.state().clone();
    let exported = document(&e)?;
    assert_eq!(exported["formatVersion"], 2);
    assert_eq!(exported["root"]["children"][0]["properties"]["breditor/start"], 8);
    assert_eq!(exported["root"]["children"][0]["children"].as_array().ok_or("items")?.len(), 2);
    assert_eq!(
        exported["root"]["children"][0]["children"][1]["children"][0]["properties"]["breditor/level"],
        2
    );
    assert_eq!(serde_json::from_str::<Value>(&string(e.state_json())?)?["formatVersion"], 3);
    let undone = e.undo(&e.observation(), false);
    assert_commit(&e, &undone)?;
    assert_eq!(e.inner.state().document(), after_typing.document());
    assert_eq!(e.inner.state().selection(), after_typing.selection());
    let checkpoint = string(e.session_checkpoint_json())?;
    assert_eq!(serde_json::from_str::<Value>(&checkpoint)?["formatVersion"], 6);
    let other = self::profile()?;
    let mut result = other.create_engine_from_session_checkpoint_json_v6(&checkpoint);
    assert_eq!(result.status(), "engine");
    let mut restored = result.take_engine().ok_or("engine")?;
    assert_eq!(string(restored.session_checkpoint_json())?, checkpoint);
    assert_eq!(restored.redo(&e.observation(), false).status(), "error");
    let redone = restored.redo(&restored.observation(), false);
    assert_commit(&restored, &redone)?;
    assert_eq!(restored.inner.state().document(), after_paste.document());
    assert_eq!(restored.inner.state().selection(), after_paste.selection());
    assert_eq!(restored.inner.state().pending_formats(), after_paste.pending_formats());
    Ok(())
}

#[test]
fn list_projection_metadata_is_exact_snapshot_local_and_optional() -> TestResult {
    let profile = profile()?;
    let mut e = engine(&profile)?;
    select(&mut e, 0, 3)?;
    let mut read = e.projection(&e.observation());
    let old = read.take_projection().ok_or("projection")?;
    assert_eq!(old.list_kind(1), Some("ordered"));
    assert_eq!(old.ordered_list_start(1), Some(8));
    assert_eq!(old.heading_level(3), Some(2));
    for index in [0, 2, 3, 4, 5, u32::MAX] {
        assert_eq!(old.list_kind(index), None);
        assert_eq!(old.ordered_list_start(index), None);
    }
    let observation = e.observation();
    let same = e.execute_no_input_action(&observation, "breditor/wrap-ordered-list", false);
    assert_eq!(same.status(), "disabled");
    assert_eq!(e.observation().inner(), observation.inner());
    let bullet = e.execute_no_input_action(&e.observation(), "breditor/wrap-bullet-list", false);
    assert_commit(&e, &bullet)?;
    let mut update = bullet.projection_update().ok_or("update")?;
    assert_eq!(update.impact(), "rootSplice");
    let new = update.take_projection().ok_or("new projection")?;
    assert_eq!(new.list_kind(1), Some("bullet"));
    assert_eq!(new.ordered_list_start(1), None);
    assert_eq!(old.list_kind(1), Some("ordered"));
    assert_eq!(old.ordered_list_start(1), Some(8));
    let unwrapped = e.execute_no_input_action(&e.observation(), "breditor/unwrap-list", false);
    assert_commit(&e, &unwrapped)?;
    assert_eq!(document(&e)?["root"]["children"][0]["type"], "breditor/heading");
    assert_eq!(
        serde_json::from_str::<Value>(&string(e.state_json())?)?["selection"]["anchor"]["textPath"],
        json!([0, 0])
    );
    Ok(())
}

#[test]
fn list_commands_use_explicit_ids_and_fail_closed_projection_impact() -> TestResult {
    let profile = profile()?;
    let mut e = engine(&profile)?;
    select(&mut e, 1, 1)?;
    let typed =
        e.execute_string_action(&e.observation(), "breditor/insert-flat-list-text", "x", false);
    assert_commit(&e, &typed)?;
    // Legacy textContainers carries direct-root indices only. Do not disguise
    // nested item coordinates as direct-root text-container indices.
    assert_eq!(typed.projection_update().ok_or("update")?.impact(), "root");
    let split =
        e.execute_no_input_action(&e.observation(), "breditor/insert-flat-list-break", true);
    assert_commit(&e, &split)?;
    assert_eq!(split.projection_update().ok_or("update")?.impact(), "rootSplice");
    for id in [
        "breditor/delete-flat-list-backward",
        "breditor/set-heading-4",
        "breditor/toggle-flat-list-strong",
    ] {
        let changed = e.execute_no_input_action(&e.observation(), id, false);
        assert_commit(&e, &changed)?;
    }
    let before = string(e.session_checkpoint_json())?;
    assert_eq!(
        e.execute_string_action(
            &e.observation(),
            "breditor/insert-text-block-text",
            "wrong",
            false
        )
        .status(),
        "error"
    );
    assert_eq!(string(e.session_checkpoint_json())?, before);
    Ok(())
}

#[test]
fn bootstrap_and_restore_versions_remain_explicit_and_strict() -> TestResult {
    assert_eq!(BreditorCompiledProfile::from_bootstrap_json_v3(BOOTSTRAP).status(), "error");
    assert_eq!(BreditorCompiledProfile::from_bootstrap_json_v2(BOOTSTRAP).status(), "error");
    for json in [
        BOOTSTRAP.replace("\"formatVersion\":4", "\"formatVersion\":3"),
        BOOTSTRAP.replace("\"extensions\":[]", "\"extensions\":[],\"surprise\":true"),
        BOOTSTRAP.replace("\"formatVersion\":4", "\"formatVersion\":4,\"formatVersion\":4"),
    ] {
        assert_eq!(BreditorCompiledProfile::from_bootstrap_json_v4(&json).status(), "error");
    }
    let p = profile()?;
    let mut e = engine(&p)?;
    select(&mut e, 1, 1)?;
    let typed =
        e.execute_string_action(&e.observation(), "breditor/insert-flat-list-text", "x", false);
    assert_commit(&e, &typed)?;
    let checkpoint = string(e.session_checkpoint_json())?;
    assert_eq!(p.create_engine_from_session_checkpoint_json_v5(&checkpoint).status(), "error");
    assert_eq!(
        p.create_engine_from_session_checkpoint_json_v6(&checkpoint.replacen(
            "\"formatVersion\":6",
            "\"formatVersion\":5",
            1
        ))
        .status(),
        "error"
    );
    let mut value: Value = serde_json::from_str(&checkpoint)?;
    value["entries"][0]["forwardOperations"][0]["expected"]["children"][0]["properties"]["breditor/start"] =
        json!(9);
    assert_eq!(
        p.create_engine_from_session_checkpoint_json_v6(&value.to_string()).status(),
        "error"
    );
    assert_eq!(string(e.session_checkpoint_json())?, checkpoint);
    Ok(())
}

#[test]
fn invalid_factory_inputs_and_v5_publication_leave_existing_handles_usable() -> TestResult {
    let p = profile()?;
    let mut e = engine(&p)?;
    let doc = document(&e)?.to_string();
    for capacity in [-1.0, 0.5, f64::NAN, f64::INFINITY] {
        assert_eq!(p.create_engine_from_document_json_v6("test", &doc, capacity).status(), "error");
    }
    assert_eq!(p.create_engine_from_document_json_v6("", &doc, 10.0).status(), "error");
    let mut invalid: Value = serde_json::from_str(&doc)?;
    let nested = invalid["root"]["children"][0].clone();
    invalid["root"]["children"][0]["children"][0]["children"] = json!([nested]);
    assert_eq!(
        p.create_engine_from_document_json_v6("test", &invalid.to_string(), 10.0).status(),
        "error"
    );
    let mut old = p.create_engine_from_document_json_v5("old-owner", &doc, 20.0);
    let mut old = old.take_engine().ok_or("old owner")?;
    select(&mut old, 1, 1)?;
    let saved = string(old.session_checkpoint_json())?;
    assert_eq!(
        old.execute_string_action(&old.observation(), "breditor/insert-flat-list-text", "x", false)
            .status(),
        "error"
    );
    assert_eq!(string(old.session_checkpoint_json())?, saved);
    select(&mut e, 1, 1)?;
    let valid =
        e.execute_string_action(&e.observation(), "breditor/insert-flat-list-text", "x", false);
    assert_commit(&e, &valid)?;
    Ok(())
}

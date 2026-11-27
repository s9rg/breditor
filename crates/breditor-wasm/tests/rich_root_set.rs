//! Native boundary of the multi-root history coordinator over separate rich editors.
#![cfg(feature = "experimental-rich-content")]

use breditor_wasm::{
    BreditorRichEditor, BreditorRichProfile, BreditorRichRootSet, BreditorStringResult,
};
use serde_json::{Value, json};

type TestResult<T = ()> = Result<T, Box<dyn std::error::Error>>;

fn read(mut result: BreditorStringResult) -> TestResult<String> {
    assert_eq!(result.status(), "value", "{:?}", result.error().map(|e| e.code()));
    Ok(result.take_value().ok_or("value")?)
}
fn code(result: &BreditorStringResult) -> String {
    result.error().map(|error| error.code()).unwrap_or_default()
}
fn profile() -> TestResult<BreditorRichProfile> {
    let bootstrap = json!({"format":"breditor/profile-bootstrap","formatVersion":6,
        "schema":{"name":"example/rich-roots","version":1},"extensions":[]});
    Ok(BreditorRichProfile::from_bootstrap_json(&bootstrap.to_string())
        .take_profile()
        .ok_or("profile")?)
}
fn editor(profile: &BreditorRichProfile) -> TestResult<BreditorRichEditor> {
    let descriptor: Value = serde_json::from_str(&read(profile.descriptor_json())?)?;
    let document = json!({"format":"breditor/document","formatVersion":2,
        "schema":descriptor["schema"],"schemaFingerprint":descriptor["schemaFingerprint"],
        "root":{"kind":"element","type":"breditor/document","entityId":null,"properties":{"breditor/document-id":"d"},
            "children":[{"kind":"element","type":"breditor/paragraph","entityId":null,"properties":{"breditor/block-id":"p"},
                "children":[{"kind":"text","text":"x","formats":[]}]}]}});
    let mut editor =
        profile.create_editor(&document.to_string(), "100").take_editor().ok_or("editor")?;
    let point = json!({"block":"p","offset":"1","affinity":"after"});
    run(
        &mut editor,
        &json!({"kind":"setSelection","selection":{"kind":"text","anchor":point,"focus":point}}),
    );
    Ok(editor)
}
fn run(editor: &mut BreditorRichEditor, command: &Value) -> String {
    let result = editor.execute(&editor.observe(), &command.to_string());
    assert!(result.error().is_none(), "{command}");
    result.status()
}
fn text(editor: &BreditorRichEditor) -> TestResult<String> {
    let value: Value = serde_json::from_str(&read(editor.observe().document_json())?)?;
    Ok(value["root"]["children"][0]["children"][0]["text"].as_str().unwrap_or_default().to_owned())
}
fn state(set: &BreditorRichRootSet) -> TestResult<Value> {
    Ok(serde_json::from_str(&set.state_json())?)
}

#[test]
fn coordinator_orders_undo_across_separate_root_editors() -> TestResult {
    let profile = profile()?;
    let (mut header, mut content) = (editor(&profile)?, editor(&profile)?);
    let mut set = BreditorRichRootSet::new();
    read(set.add_root(r#"{"id":"header","label":"Header"}"#, &header, None))?;
    read(set.add_root(r#"{"id":"content","attributes":{"order":"2"}}"#, &content, None))?;
    assert_eq!(code(&set.add_root(r#"{"id":"again"}"#, &header, None)), "breditor_rich.root_owner");
    assert_eq!(
        code(&set.add_root(r#"{"id":"1bad"}"#, &editor(&profile)?, None)),
        "breditor_rich.root_id"
    );
    assert_eq!(code(&set.reconcile("header", &content)), "breditor_rich.root_owner");

    run(&mut header, &json!({"kind":"insertPlainText","text":"A"}));
    read(set.reconcile("header", &header))?;
    run(&mut content, &json!({"kind":"insertPlainText","text":"B"}));
    read(set.reconcile("content", &content))?;
    let value = state(&set)?;
    assert_eq!(value["undoDepth"], 2);
    assert_eq!(value["undoTarget"], "content");
    assert_eq!(value["active"], "content");
    // The host routes global Undo to the named root, then reconciles.
    assert_eq!(run(&mut content, &json!({"kind":"undo"})), "undo");
    read(set.reconcile("content", &content))?;
    assert_eq!(state(&set)?["undoTarget"], "header");
    assert_eq!(run(&mut header, &json!({"kind":"undo"})), "undo");
    read(set.reconcile("header", &header))?;
    assert_eq!((text(&header)?, text(&content)?), ("x".to_owned(), "x".to_owned()));
    assert_eq!(state(&set)?["redoTarget"], "header");
    run(&mut header, &json!({"kind":"redo"}));
    read(set.reconcile("header", &header))?;

    let parts = json!([
        {"id":"header","history":"explicit","selection":"original","checkpoint":read(header.checkpoint_json())?},
        {"id":"content","history":"explicit","selection":"original","checkpoint":read(content.checkpoint_json())?}]);
    let envelope = read(set.checkpoint_json(&parts.to_string()))?;
    let mut restored = BreditorRichRootSet::new();
    let parts: Value = serde_json::from_str(&read(restored.restore(&envelope))?)?;
    assert_eq!(state(&restored)?["complete"], false);
    let mut editors = vec![];
    for part in parts.as_array().ok_or("parts")? {
        let root = profile
            .restore_editor(part["checkpoint"].as_str().ok_or("checkpoint")?)
            .take_editor()
            .ok_or("root")?;
        read(restored.attach(part["id"].as_str().ok_or("id")?, &root))?;
        editors.push(root);
    }
    let value = state(&restored)?;
    assert_eq!(
        (value["complete"].clone(), value["undoTarget"].clone(), value["redoTarget"].clone()),
        (json!(true), json!("header"), json!("content"))
    );
    assert_eq!(value["roots"][1]["attributes"]["order"], "2");

    // Attaching a root whose history disagrees with the journal is refused.
    let mut tampered = BreditorRichRootSet::new();
    let mut envelope: Value = serde_json::from_str(&envelope)?;
    envelope["cursor"] = json!(0);
    read(tampered.restore(&envelope.to_string()))?;
    assert_eq!(
        code(&tampered.attach("header", &editors[0])),
        "breditor_rich.root_history_mismatch"
    );

    read(set.remove_root("header"))?;
    assert_eq!(state(&set)?["undoDepth"], 0);
    assert_eq!(state(&set)?["redoTarget"], "content");
    Ok(())
}

/// Checkpoint parts for every attached root (set order), then every retained detached root.
fn set_parts(
    set: &BreditorRichRootSet,
    editors: &[(&str, &BreditorRichEditor)],
) -> TestResult<String> {
    let value = state(set)?;
    let mut parts = vec![];
    for (list, detached) in [("roots", false), ("detached", true)] {
        for root in value[list].as_array().ok_or("list")? {
            let id = root.as_str().or_else(|| root["id"].as_str()).ok_or("id")?;
            let editor = editors.iter().find(|(name, _)| *name == id).ok_or("editor")?.1;
            parts.push(json!({"id":id,"detached":detached,"history":"explicit",
                "selection":"original","checkpoint":read(editor.checkpoint_json())?}));
        }
    }
    Ok(Value::Array(parts).to_string())
}

#[test]
fn undoable_structure_steps_route_through_the_coordinator_and_checkpoint_v2() -> TestResult {
    let profile = profile()?;
    let (mut header, mut content) = (editor(&profile)?, editor(&profile)?);
    let mut set = BreditorRichRootSet::new();
    assert_eq!(set.root_history_version(), "1");
    let sidebar = editor(&profile)?;
    // The first root is composed outside history.
    assert_eq!(
        code(&set.add_root_undoable(r#"{"id":"x"}"#, &sidebar, None, None)),
        "breditor_rich.root_last"
    );
    read(set.add_root(r#"{"id":"header"}"#, &header, None))?;
    read(set.add_root(r#"{"id":"content"}"#, &content, None))?;
    run(&mut content, &json!({"kind":"insertPlainText","text":"B"}));
    read(set.reconcile("content", &content))?;

    let revision = state(&set)?["revision"].as_str().ok_or("revision")?.to_owned();
    assert_eq!(
        code(&set.remove_root_undoable("content", Some("0".to_owned()))),
        "breditor_rich.root_set_stale"
    );
    let value: Value =
        serde_json::from_str(&read(set.remove_root_undoable("content", Some(revision)))?)?;
    assert_eq!(value["roots"], json!([{"id":"header","label":null,"attributes":{}}]));
    assert_eq!(value["detached"], json!(["content"]));
    assert_eq!(
        (value["undoStep"].clone(), value["undoTarget"].clone()),
        (json!("remove"), json!("content"))
    );
    assert_eq!(code(&set.remove_root_undoable("header", None)), "breditor_rich.root_last");
    assert_eq!(code(&set.remove_root_undoable("nope", None)), "breditor_rich.root_unknown");
    // The detached editor stays bound but accepts no reconciliation; another id is refused.
    assert_eq!(code(&set.reconcile("content", &content)), "breditor_rich.root_unknown");
    assert_eq!(
        code(&set.add_root_undoable(r#"{"id":"content"}"#, &sidebar, None, None)),
        "breditor_rich.root_duplicate"
    );
    read(set.add_root_undoable(r#"{"id":"sidebar","label":"Sidebar"}"#, &sidebar, Some(0), None))?;
    read(set.set_attribute("header", "order", "2", None))?;
    assert_eq!(code(&set.move_root("header", 7, None)), "breditor_rich.root_index");
    read(set.move_root("header", 0, None))?;
    // A content undo routed to the structure path is refused.
    run(&mut header, &json!({"kind":"insertPlainText","text":"A"}));
    read(set.reconcile("header", &header))?;
    assert_eq!(state(&set)?["undoStep"], "root");
    assert_eq!(code(&set.undo_structure(None)), "breditor_rich.root_structure_step");
    run(&mut header, &json!({"kind":"undo"}));
    read(set.reconcile("header", &header))?;

    let roots = [("header", &header), ("content", &content), ("sidebar", &sidebar)];
    let envelope = read(set.checkpoint_json(&set_parts(&set, &roots)?))?;
    let decoded: Value = serde_json::from_str(&envelope)?;
    assert_eq!(decoded["formatVersion"], 2);

    let mut restored = BreditorRichRootSet::new();
    let restored_parts: Value = serde_json::from_str(&read(restored.restore(&envelope))?)?;
    let mut editors = vec![];
    for part in restored_parts.as_array().ok_or("parts")? {
        let root = profile
            .restore_editor(part["checkpoint"].as_str().ok_or("checkpoint")?)
            .take_editor()
            .ok_or("root")?;
        read(restored.attach(part["id"].as_str().ok_or("id")?, &root))?;
        editors.push((part["id"].as_str().ok_or("id")?.to_owned(), part["detached"].clone(), root));
    }
    assert_eq!(editors[2].0, "content");
    assert_eq!(editors[2].1, json!(true));
    assert_eq!(state(&restored)?["complete"], true);
    // Global Undo through the redo-side header unit, then the move, attribute, add and removal.
    run(&mut editors[0].2, &json!({"kind":"redo"}));
    let header_editor = &editors.iter().find(|entry| entry.0 == "header").ok_or("header")?.2;
    read(restored.reconcile("header", header_editor))?;
    for expected in ["root", "move", "attributes", "add", "remove"] {
        let value = state(&restored)?;
        assert_eq!(value["undoStep"], expected);
        if expected == "root" {
            let index = editors.iter().position(|entry| entry.0 == "header").ok_or("header")?;
            run(&mut editors[index].2, &json!({"kind":"undo"}));
            read(restored.reconcile("header", &editors[index].2))?;
        } else {
            read(restored.undo_structure(None))?;
        }
    }
    let value = state(&restored)?;
    assert_eq!(value["roots"].as_array().ok_or("roots")?.len(), 2);
    assert_eq!(value["roots"][1]["id"], "content");
    assert_eq!(value["detached"], json!(["sidebar"]));
    assert_eq!(value["active"], "content");
    let content_editor = &editors.iter().find(|entry| entry.0 == "content").ok_or("content")?.2;
    assert_eq!(text(content_editor)?, "xB");
    // A new edit clears the redo branch and releases the undone addition's editor binding.
    let index = editors.iter().position(|entry| entry.0 == "content").ok_or("content")?;
    run(&mut editors[index].2, &json!({"kind":"insertPlainText","text":"C"}));
    read(restored.reconcile("content", &editors[index].2))?;
    assert_eq!(state(&restored)?["detached"], json!([]));
    Ok(())
}

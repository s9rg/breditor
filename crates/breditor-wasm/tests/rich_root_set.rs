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

//! Restricted editing through the Wasm owner: policy JSON, view field, refusal codes and Tab navigation.
#![cfg(feature = "experimental-rich-content")]
#[path = "../../breditor-core/tests/support/coverage_fixture.rs"]
#[allow(dead_code)]
mod fixture;
use breditor_wasm::{BreditorRichEditor, BreditorRichProfile, BreditorStringResult};
use serde_json::{Value, json};
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;
fn read(mut r: BreditorStringResult) -> Result<String> {
    r.take_value().ok_or("read".into())
}
fn owner() -> Result<BreditorRichEditor> {
    let bootstrap = json!({"format":"breditor/profile-bootstrap","formatVersion":9,"schema":{"name":"example/layout","version":1},"extensions":[]}).to_string();
    let p = BreditorRichProfile::from_standard_bootstrap_json_v4(&bootstrap)
        .take_profile()
        .ok_or("profile")?;
    let d: Value = serde_json::from_str(&read(p.descriptor_json())?)?;
    let mut root = fixture::element(
        "document",
        "unused",
        vec![
            fixture::paragraph("intro", "Intro"),
            fixture::paragraph("field", "Name"),
            fixture::paragraph("tail", "Tail"),
        ],
    );
    root["properties"] = json!({"breditor/document-id":"room"});
    p.create_editor(&json!({"format":"breditor/document","formatVersion":2,"schema":d["schema"],"schemaFingerprint":d["schemaFingerprint"],"root":root}).to_string(), "100").take_editor().ok_or("owner".into())
}
fn caret(block: &str, offset: &str) -> Value {
    json!({"kind":"text","anchor":{"block":block,"offset":offset,"affinity":"after"},"focus":{"block":block,"offset":offset,"affinity":"after"}})
}
fn run(a: &mut BreditorRichEditor, c: &Value) -> (String, Option<String>) {
    let r = a.execute(&a.observe(), &c.to_string());
    (r.status(), r.error().map(|e| e.code()))
}
fn view(a: &BreditorRichEditor) -> Result<Value> {
    Ok(serde_json::from_str(&read(a.observe().view_json())?)?)
}
fn policy(ids: &[&str]) -> String {
    json!({"format":"breditor/rich-restricted-policy","formatVersion":1,"editable":ids}).to_string()
}

#[test]
fn policy_view_refusal_and_navigation() -> Result {
    let mut a = owner()?;
    assert_eq!(a.restricted_editing_version(), "1");
    let plain = view(&a)?;
    assert!(plain.get("restricted").is_none());
    for bad in ["{}", "[]", r#"{"format":"x","formatVersion":1,"editable":[]}"#, &policy(&[""])] {
        assert!(read(a.set_restricted_editing(&a.observe(), bad)).is_err(), "{bad}");
    }
    assert_eq!(read(a.set_restricted_editing(&a.observe(), &policy(&["tail", "field"])))?, "true");
    assert_eq!(read(a.set_restricted_editing(&a.observe(), &policy(&["field", "tail"])))?, "false");
    let v = view(&a)?;
    assert_eq!(v["restricted"]["editable"], json!(["field", "tail"]));
    assert_eq!(v["restricted"]["selectionEditable"], false);
    let r = a.navigate_restricted_region(&a.observe(), true);
    assert_eq!(r.status(), "selection");
    assert_eq!(view(&a)?["restricted"]["selectionEditable"], true);
    assert_eq!(run(&mut a, &json!({"kind":"insertPlainText","text":"X"})).0, "content");
    assert_eq!(
        run(&mut a, &json!({"kind":"setSelection","selection":caret("intro","1")})).0,
        "selection"
    );
    assert_eq!(
        run(&mut a, &json!({"kind":"insertPlainText","text":"X"})),
        ("error".to_owned(), Some("breditor_rich.restricted".to_owned()))
    );
    assert_eq!(a.navigate_restricted_region(&a.observe(), false).status(), "unchanged");
    assert_eq!(a.navigate_restricted_region(&a.observe(), true).status(), "selection");
    assert_eq!(a.navigate_restricted_region(&a.observe(), true).status(), "selection");
    assert_eq!(a.navigate_restricted_region(&a.observe(), true).status(), "unchanged");
    assert_eq!(run(&mut a, &json!({"kind":"undo"})).0, "undo");
    assert_eq!(read(a.set_restricted_editing(&a.observe(), "null"))?, "true");
    assert!(view(&a)?.get("restricted").is_none());
    assert_eq!(a.navigate_restricted_region(&a.observe(), true).status(), "error");
    Ok(())
}

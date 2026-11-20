//! Candidate V4 mentions through the Wasm descriptor, owner capability and command boundary.
#![cfg(feature = "experimental-rich-content")]
#[path = "../../breditor-core/tests/support/coverage_fixture.rs"]
#[allow(dead_code)]
mod fixture;
#[path = "../../breditor-core/tests/support/rich_v4_frozen.rs"]
mod frozen;
use breditor_wasm::{BreditorRichEditor, BreditorRichProfile, BreditorStringResult};
use serde_json::{Value, json};
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;
fn read(mut r: BreditorStringResult) -> Result<String> {
    r.take_value().ok_or("read".into())
}
fn bootstrap(revision: u32) -> String {
    json!({"format":"breditor/profile-bootstrap","formatVersion":revision,"schema":{"name":"example/layout","version":1},"extensions":[]}).to_string()
}
fn profile() -> Result<BreditorRichProfile> {
    BreditorRichProfile::from_standard_bootstrap_json_v4(&bootstrap(9))
        .take_profile()
        .ok_or("profile".into())
}
fn descriptor(p: &BreditorRichProfile) -> Result<Value> {
    Ok(serde_json::from_str(&read(p.descriptor_json())?)?)
}
/// `p`: "Hi @an", `q`: "Other".
fn root() -> Value {
    let mut root = fixture::element(
        "document",
        "unused",
        vec![fixture::paragraph("p", "Hi @an"), fixture::paragraph("q", "Other")],
    );
    root["properties"] = json!({"breditor/document-id":"room"});
    root
}
fn owner(p: &BreditorRichProfile, root: &Value) -> Result<BreditorRichEditor> {
    let d = descriptor(p)?;
    p.create_editor(&json!({"format":"breditor/document","formatVersion":2,"schema":d["schema"],"schemaFingerprint":d["schemaFingerprint"],"root":root}).to_string(), "100").take_editor().ok_or("owner".into())
}
fn run(a: &mut BreditorRichEditor, c: &Value) -> String {
    a.execute(&a.observe(), &c.to_string()).status()
}
fn text(block: &str, start: u32, end: u32) -> Value {
    json!({"kind":"text","anchor":{"block":block,"offset":start.to_string(),"affinity":"after"},"focus":{"block":block,"offset":end.to_string(),"affinity":"after"}})
}
fn insert(selection: Value, mention: Value) -> Value {
    let mut command = json!({"kind":"insertMention","data":{}});
    command["data"]["selection"] = selection;
    command["data"]["mention"] = mention;
    command
}
fn ann() -> Value {
    json!({"kind":"user","id":"u-1","label":"Ann"})
}
fn runs(a: &BreditorRichEditor) -> Result<Value> {
    let d: Value = serde_json::from_str(&read(a.observe().document_json())?)?;
    Ok(d["root"]["children"][0]["children"].clone())
}
fn selection(a: &BreditorRichEditor) -> Result<Value> {
    let v: Value = serde_json::from_str(&read(a.observe().view_json())?)?;
    Ok(v["selection"].clone())
}

#[test]
fn v4_descriptor_and_owner_report_mentions_only_for_v4() -> Result {
    let p = profile()?;
    let d = descriptor(&p)?;
    assert_eq!(d["mentionVersion"], 1);
    assert_eq!(d["imageLinkVersion"], 1);
    assert_eq!(d["schemaFingerprint"], frozen::V4_LAYOUT_FINGERPRINT, "{}", frozen::FROZEN);
    assert_eq!(owner(&p, &root())?.mention_version(), "1");
    let catalog: Value = serde_json::from_str(&read(p.inline_catalog_json())?)?;
    let declared = catalog["formats"]
        .as_array()
        .ok_or("formats")?
        .iter()
        .find(|format| format["kind"] == "breditor/mention")
        .ok_or("mention format")?
        .clone();
    assert_eq!(declared["properties"].as_array().ok_or("properties")?.len(), 3);
    let plain =
        BreditorRichProfile::from_bootstrap_json_v4(&bootstrap(9)).take_profile().ok_or("plain")?;
    assert_eq!(descriptor(&plain)?["mentionVersion"], 1);
    for mut result in [
        BreditorRichProfile::from_standard_bootstrap_json_v1(&bootstrap(6)),
        BreditorRichProfile::from_standard_structural_bootstrap_json_v2(&bootstrap(7)),
        BreditorRichProfile::from_standard_layout_bootstrap_json_v3(&bootstrap(8)),
    ] {
        let old = result.take_profile().ok_or("old profile")?;
        assert!(descriptor(&old)?.get("mentionVersion").is_none());
        let mut a = owner(&old, &root())?;
        assert_eq!(a.mention_version(), "0");
        let before = read(a.checkpoint_json())?;
        assert_eq!(run(&mut a, &insert(text("p", 3, 6), ann())), "error");
        assert_eq!(read(a.checkpoint_json())?, before);
        let mut raw = root();
        raw["children"][0]["children"] = json!([{"kind":"text","text":"@Ann","formats":[{"type":"breditor/mention","properties":{"breditor/mention-id":"u-1","breditor/mention-kind":"user","breditor/mention-label":"Ann"}}]}]);
        assert!(owner(&old, &raw).is_err());
    }
    Ok(())
}

#[test]
fn insert_is_one_undo_step_and_survives_restore() -> Result {
    let p = profile()?;
    let mut a = owner(&p, &root())?;
    let original = runs(&a)?;
    assert_eq!(
        run(&mut a, &json!({"kind":"setSelection","selection":text("p", 6, 6)})),
        "selection"
    );
    assert_eq!(run(&mut a, &insert(text("p", 3, 6), ann())), "content");
    let inserted = runs(&a)?;
    assert_eq!(
        inserted,
        json!([
            {"kind":"text","text":"Hi ","formats":[]},
            {"kind":"text","text":"@Ann","formats":[{"type":"breditor/mention","properties":{"breditor/mention-id":"u-1","breditor/mention-kind":"user","breditor/mention-label":"Ann"}}]},
            {"kind":"text","text":" ","formats":[]}
        ])
    );
    assert_eq!(selection(&a)?["focus"]["offset"], "8");
    // Backspace after the space, then inside-range deletion of the mention, each one step.
    assert_eq!(
        run(
            &mut a,
            &json!({"kind":"replaceTextRange","data":{"selection":text("p", 7, 8),"text":""}})
        ),
        "content"
    );
    assert_eq!(
        run(
            &mut a,
            &json!({"kind":"replaceTextRange","data":{"selection":text("p", 6, 7),"text":""}})
        ),
        "content"
    );
    assert_eq!(runs(&a)?, json!([{"kind":"text","text":"Hi ","formats":[]}]));
    assert_eq!(run(&mut a, &json!({"kind":"undo"})), "undo");
    assert_eq!(run(&mut a, &json!({"kind":"undo"})), "undo");
    assert_eq!(runs(&a)?, inserted);
    let mut b = p.restore_editor(&read(a.checkpoint_json())?).take_editor().ok_or("restore")?;
    assert_eq!(runs(&b)?, inserted);
    assert_eq!(run(&mut b, &json!({"kind":"undo"})), "undo");
    assert_eq!(runs(&b)?, original);
    assert_eq!(selection(&b)?["focus"]["offset"], "6");
    assert_eq!(run(&mut b, &json!({"kind":"redo"})), "redo");
    assert_eq!(runs(&b)?, inserted);
    Ok(())
}

#[test]
fn read_only_stale_and_malformed_intent_is_refused_without_publication() -> Result {
    let p = profile()?;
    let mut a = owner(&p, &root())?;
    let before = read(a.checkpoint_json())?;
    for data in [
        json!({"selection":text("p", 3, 6),"mention":{"kind":"team","id":"u","label":"Ann"}}),
        json!({"selection":text("p", 3, 6),"mention":{"kind":"user","id":"u 1","label":"Ann"}}),
        json!({"selection":text("p", 3, 6),"mention":{"kind":"user","id":"u","label":""}}),
        json!({"selection":text("p", 3, 6),"mention":{"kind":"user","id":"u","label":"A\nB"}}),
        json!({"selection":text("p", 3, 6),"mention":{"kind":"user","id":"u","label":"A","x":1}}),
        json!({"selection":text("p", 3, 6)}),
        json!({"selection":text("p", 3, 6),"mention":ann(),"extra":1}),
        json!({"selection":text("missing", 0, 0),"mention":ann()}),
        json!({"selection":{"kind":"text","anchor":{"block":"p","offset":"3","affinity":"after"},"focus":{"block":"q","offset":"1","affinity":"after"}},"mention":ann()}),
    ] {
        let mut command = json!({"kind":"insertMention"});
        command["data"] = data.clone();
        assert_eq!(run(&mut a, &command), "error", "{data}");
    }
    assert_eq!(read(a.checkpoint_json())?, before);
    read(a.set_read_only(&a.observe(), true))?;
    let locked = read(a.checkpoint_json())?;
    assert_eq!(run(&mut a, &insert(text("p", 3, 6), ann())), "error");
    assert_eq!(read(a.checkpoint_json())?, locked);
    read(a.set_read_only(&a.observe(), false))?;
    let stale = a.observe();
    assert_eq!(
        run(&mut a, &json!({"kind":"setSelection","selection":text("p", 1, 1)})),
        "selection"
    );
    assert_eq!(a.execute(&stale, &insert(text("p", 3, 6), ann()).to_string()).status(), "error");
    Ok(())
}

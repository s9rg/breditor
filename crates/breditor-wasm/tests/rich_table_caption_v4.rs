//! Candidate V4 table captions through the Wasm descriptor, owner capability and commands.
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
/// Paragraph `p`, one 1×1 table `t` (block `table`, cell text `c`), paragraph `q`; then `tail`.
fn root(tail: Vec<Value>) -> Value {
    let mut cell = fixture::element("table-cell", "cell", vec![fixture::paragraph("c", "Cell")]);
    cell["properties"]["breditor/column-id"] = json!("k");
    cell["properties"]["breditor/header"] = json!(false);
    let mut row = fixture::element("table-row", "row", vec![cell]);
    row["properties"]["breditor/row-id"] = json!("r");
    let mut children = vec![row];
    children.extend(tail);
    let mut table = fixture::element("table", "table", children);
    table["properties"] = json!({"breditor/block-id":"table","breditor/table-id":"t","breditor/columns":[{"id":"k","width":160}],"breditor/merges":[],"breditor/retracted-merges":[]});
    let mut root = fixture::element(
        "document",
        "unused",
        vec![fixture::paragraph("p", "One"), table, fixture::paragraph("q", "Two")],
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
fn command(kind: &str, data: Value) -> Value {
    let mut value = json!({"kind":kind});
    value["data"] = data;
    value
}
fn table(a: &BreditorRichEditor) -> Result<Value> {
    let d: Value = serde_json::from_str(&read(a.observe().document_json())?)?;
    Ok(d["root"]["children"][1].clone())
}
fn add() -> Value {
    command("addTableCaption", json!({"table":"t","caption":"cap"}))
}
fn remove() -> Value {
    command("removeTableCaption", json!({"table":"t"}))
}

#[test]
fn v4_descriptor_and_owner_report_table_captions_only_for_v4() -> Result {
    let p = profile()?;
    let d = descriptor(&p)?;
    assert_eq!(d["tableCaptionVersion"], 1);
    assert_eq!(
        d["schemaFingerprint"],
        "sha256:40ed4c0716f9baab1ec30da8b5641623b8fbbdafc7e6f838f5b0496e01add372"
    );
    assert_eq!(owner(&p, &root(vec![]))?.table_caption_version(), "1");
    let plain =
        BreditorRichProfile::from_bootstrap_json_v4(&bootstrap(9)).take_profile().ok_or("plain")?;
    assert_eq!(descriptor(&plain)?["tableCaptionVersion"], 1);
    for mut result in [
        BreditorRichProfile::from_standard_bootstrap_json_v1(&bootstrap(6)),
        BreditorRichProfile::from_standard_structural_bootstrap_json_v2(&bootstrap(7)),
        BreditorRichProfile::from_standard_layout_bootstrap_json_v3(&bootstrap(8)),
    ] {
        let old = result.take_profile().ok_or("old profile")?;
        assert!(descriptor(&old)?.get("tableCaptionVersion").is_none());
        let mut a = owner(&old, &root(vec![]))?;
        assert_eq!(a.table_caption_version(), "0");
        let before = read(a.checkpoint_json())?;
        assert_eq!(run(&mut a, &add()), "error");
        assert_eq!(run(&mut a, &remove()), "error");
        assert_eq!(read(a.checkpoint_json())?, before);
        assert!(owner(&old, &root(vec![fixture::paragraph("cap", "x")])).is_err());
    }
    Ok(())
}

#[test]
fn add_type_remove_undo_redo_and_restore() -> Result {
    let p = profile()?;
    let mut a = owner(&p, &root(vec![]))?;
    let original = table(&a)?;
    assert_eq!(run(&mut a, &add()), "content");
    let added = table(&a)?;
    assert_eq!(added["children"][1], fixture::paragraph("cap", ""));
    let view: Value = serde_json::from_str(&read(a.observe().view_json())?)?;
    assert_eq!(view["selection"]["focus"]["block"], "cap");
    // The table view still reports one row.
    assert_eq!(view["tables"][0]["rows"].as_array().map(Vec::len), Some(1));
    assert_eq!(run(&mut a, &json!({"kind":"insertPlainText","text":"Legend"})), "content");
    let typed = table(&a)?;
    assert_eq!(typed["children"][1], fixture::paragraph("cap", "Legend"));
    // Adding again is refused; removing moves the caption caret to the table node.
    let before = read(a.checkpoint_json())?;
    assert_eq!(
        run(&mut a, &command("addTableCaption", json!({"table":"t","caption":"x"}))),
        "error"
    );
    assert_eq!(read(a.checkpoint_json())?, before);
    assert_eq!(run(&mut a, &remove()), "content");
    assert_eq!(table(&a)?, original);
    let view: Value = serde_json::from_str(&read(a.observe().view_json())?)?;
    assert_eq!(view["selection"], json!({"kind":"node","block":"table"}));
    assert_eq!(run(&mut a, &remove()), "unchanged");
    let mut b = p.restore_editor(&read(a.checkpoint_json())?).take_editor().ok_or("restore")?;
    assert_eq!(table(&b)?, original);
    for expected in [&typed, &added, &original] {
        assert_eq!(run(&mut b, &json!({"kind":"undo"})), "undo");
        assert_eq!(&table(&b)?, expected);
    }
    assert_eq!(run(&mut b, &json!({"kind":"redo"})), "redo");
    assert_eq!(table(&b)?, added);
    Ok(())
}

#[test]
fn malformed_read_only_and_stale_intent() -> Result {
    let p = profile()?;
    let mut a = owner(&p, &root(vec![]))?;
    let before = read(a.checkpoint_json())?;
    for bad in [
        command("addTableCaption", json!({"table":"t"})),
        command("addTableCaption", json!({"caption":"cap"})),
        command("addTableCaption", json!({"table":"t","caption":"cap","text":"x"})),
        command("addTableCaption", json!({"table":"nope","caption":"cap"})),
        command("addTableCaption", json!({"table":"t","caption":"p"})),
        command("addTableCaption", json!({"table":"t","caption":""})),
        command("addTableCaption", json!({"table":7,"caption":"cap"})),
        command("removeTableCaption", json!({"table":"t","caption":"cap"})),
        command("removeTableCaption", json!({})),
        command("removeTableCaption", json!({"table":"nope"})),
        json!({"kind":"addTableCaption","table":"t","caption":"cap"}),
    ] {
        assert_eq!(run(&mut a, &bad), "error", "{bad}");
    }
    assert_eq!(read(a.checkpoint_json())?, before);
    read(a.set_read_only(&a.observe(), true))?;
    assert_eq!(run(&mut a, &add()), "error");
    read(a.set_read_only(&a.observe(), false))?;
    let stale = a.observe();
    assert_eq!(run(&mut a, &add()), "content");
    assert_eq!(a.execute(&stale, &remove().to_string()).status(), "error");
    assert_eq!(table(&a)?["children"][1], fixture::paragraph("cap", ""));
    Ok(())
}

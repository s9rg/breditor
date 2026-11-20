//! Candidate V4 page breaks through the Wasm descriptor, owner capability and commands.
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
fn page_break(id: &str) -> Value {
    fixture::element("page-break", id, vec![])
}
fn root(children: Vec<Value>) -> Value {
    let mut root = fixture::element("document", "unused", children);
    root["properties"] = json!({"breditor/document-id":"room"});
    root
}
fn plain() -> Value {
    root(vec![fixture::paragraph("p", "One"), fixture::paragraph("q", "Two")])
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
fn children(a: &BreditorRichEditor) -> Result<Value> {
    let d: Value = serde_json::from_str(&read(a.observe().document_json())?)?;
    Ok(d["root"]["children"].clone())
}
fn insert(before: Option<&str>) -> Value {
    command(
        "insertPageBreak",
        json!({"position":{"parent":{"kind":"document"},"before":before},"block":"pb"}),
    )
}
fn delete() -> Value {
    command("deletePageBreak", json!({"block":"pb","paragraph":"floor"}))
}

#[test]
fn v4_descriptor_and_owner_report_page_breaks_only_for_v4() -> Result {
    let p = profile()?;
    let d = descriptor(&p)?;
    assert_eq!(d["pageBreakVersion"], 1);
    assert_eq!(d["schemaFingerprint"], frozen::V4_LAYOUT_FINGERPRINT, "{}", frozen::FROZEN);
    assert_eq!(owner(&p, &plain())?.page_break_version(), "1");
    let bare =
        BreditorRichProfile::from_bootstrap_json_v4(&bootstrap(9)).take_profile().ok_or("bare")?;
    assert_eq!(descriptor(&bare)?["pageBreakVersion"], 1);
    for mut result in [
        BreditorRichProfile::from_standard_bootstrap_json_v1(&bootstrap(6)),
        BreditorRichProfile::from_standard_structural_bootstrap_json_v2(&bootstrap(7)),
        BreditorRichProfile::from_standard_layout_bootstrap_json_v3(&bootstrap(8)),
    ] {
        let old = result.take_profile().ok_or("old profile")?;
        assert!(descriptor(&old)?.get("pageBreakVersion").is_none());
        let mut a = owner(&old, &plain())?;
        assert_eq!(a.page_break_version(), "0");
        let before = read(a.checkpoint_json())?;
        assert_eq!(run(&mut a, &insert(None)), "error");
        assert_eq!(run(&mut a, &delete()), "error");
        let draft = command(
            "insertBlocks",
            json!({"position":{"parent":{"kind":"document"},"before":null},"blocks":[{"kind":"pageBreak","block":"pb"}]}),
        );
        assert_eq!(run(&mut a, &draft), "error");
        assert_eq!(read(a.checkpoint_json())?, before);
        assert!(owner(&old, &root(vec![page_break("pb")])).is_err());
    }
    Ok(())
}

#[test]
fn insert_delete_undo_redo_draft_and_restore() -> Result {
    let p = profile()?;
    let mut a = owner(&p, &plain())?;
    let original = children(&a)?;
    assert_eq!(run(&mut a, &insert(Some("q"))), "content");
    let inserted = children(&a)?;
    assert_eq!(inserted[1], page_break("pb"));
    // The page break is node-selectable and a flow-navigation stop.
    assert_eq!(
        run(&mut a, &json!({"kind":"setSelection","selection":{"kind":"node","block":"pb"}})),
        "selection"
    );
    assert_eq!(run(&mut a, &delete()), "content");
    assert_eq!(children(&a)?, original);
    let view: Value = serde_json::from_str(&read(a.observe().view_json())?)?;
    assert_eq!(view["selection"]["focus"]["block"], "q");
    let mut b = p.restore_editor(&read(a.checkpoint_json())?).take_editor().ok_or("restore")?;
    assert_eq!(run(&mut b, &json!({"kind":"undo"})), "undo");
    assert_eq!(children(&b)?, inserted);
    assert_eq!(run(&mut b, &json!({"kind":"undo"})), "undo");
    assert_eq!(children(&b)?, original);
    assert_eq!(run(&mut b, &json!({"kind":"redo"})), "redo");
    assert_eq!(children(&b)?, inserted);
    // The generic flow draft inserts the same atom.
    let draft = command(
        "insertBlocks",
        json!({"position":{"parent":{"kind":"document"},"before":null},"blocks":[{"kind":"pageBreak","block":"pd"}]}),
    );
    assert_eq!(run(&mut b, &draft), "content");
    assert_eq!(children(&b)?[3], page_break("pd"));
    Ok(())
}

#[test]
fn malformed_misplaced_read_only_and_stale_intent() -> Result {
    let p = profile()?;
    let quoted =
        root(vec![fixture::element("blockquote", "bq", vec![fixture::paragraph("p", "A")])]);
    let mut a = owner(&p, &quoted)?;
    let before = read(a.checkpoint_json())?;
    for bad in [
        command("insertPageBreak", json!({"block":"pb"})),
        command(
            "insertPageBreak",
            json!({"position":{"parent":{"kind":"document"},"before":null}}),
        ),
        command(
            "insertPageBreak",
            json!({"position":{"parent":{"kind":"document"},"before":null},"block":"pb","x":1}),
        ),
        command(
            "insertPageBreak",
            json!({"position":{"parent":{"kind":"blockquote","block":"bq"},"before":null},"block":"pb"}),
        ),
        command(
            "insertPageBreak",
            json!({"position":{"parent":{"kind":"document"},"before":null},"block":"p"}),
        ),
        command(
            "insertPageBreak",
            json!({"position":{"parent":{"kind":"document"},"before":null},"block":""}),
        ),
        command("deletePageBreak", json!({"block":"p","paragraph":"floor"})),
        command("deletePageBreak", json!({"block":"bq"})),
        json!({"kind":"insertPageBreak","block":"pb"}),
    ] {
        assert_eq!(run(&mut a, &bad), "error", "{bad}");
    }
    assert_eq!(read(a.checkpoint_json())?, before);
    read(a.set_read_only(&a.observe(), true))?;
    assert_eq!(run(&mut a, &insert(None)), "error");
    read(a.set_read_only(&a.observe(), false))?;
    let stale = a.observe();
    assert_eq!(run(&mut a, &insert(None)), "content");
    assert_eq!(a.execute(&stale, &delete().to_string()).status(), "error");
    assert_eq!(children(&a)?[1], page_break("pb"));
    Ok(())
}

//! Candidate V4 collapsible sections through the Wasm descriptor, owner capability and commands.
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
/// Paragraphs `p` "One", `p2` "Two", `q` "Three".
fn root() -> Value {
    let mut root = fixture::element(
        "document",
        "unused",
        vec![
            fixture::paragraph("p", "One"),
            fixture::paragraph("p2", "Two"),
            fixture::paragraph("q", "Three"),
        ],
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
fn children(a: &BreditorRichEditor) -> Result<Value> {
    let d: Value = serde_json::from_str(&read(a.observe().document_json())?)?;
    Ok(d["root"]["children"].clone())
}
fn caret(block: &str, offset: u32) -> Value {
    let point = json!({"block":block,"offset":offset.to_string(),"affinity":"after"});
    json!({"kind":"setSelection","selection":{"kind":"text","anchor":point,"focus":point}})
}
fn wrap() -> Value {
    command("wrapDetails", json!({"first":"p","last":"p2","wrapper":"d","summary":"s","open":true}))
}

#[test]
fn v4_descriptor_and_owner_report_sections_only_for_v4() -> Result {
    let p = profile()?;
    let d = descriptor(&p)?;
    assert_eq!(d["detailsVersion"], 1);
    assert_eq!(d["imageLinkVersion"], 1);
    assert_eq!(
        d["schemaFingerprint"],
        "sha256:40ed4c0716f9baab1ec30da8b5641623b8fbbdafc7e6f838f5b0496e01add372"
    );
    assert_eq!(owner(&p, &root())?.details_version(), "1");
    let plain =
        BreditorRichProfile::from_bootstrap_json_v4(&bootstrap(9)).take_profile().ok_or("plain")?;
    assert_eq!(descriptor(&plain)?["detailsVersion"], 1);
    for mut result in [
        BreditorRichProfile::from_standard_bootstrap_json_v1(&bootstrap(6)),
        BreditorRichProfile::from_standard_structural_bootstrap_json_v2(&bootstrap(7)),
        BreditorRichProfile::from_standard_layout_bootstrap_json_v3(&bootstrap(8)),
    ] {
        let old = result.take_profile().ok_or("old profile")?;
        assert!(descriptor(&old)?.get("detailsVersion").is_none());
        let mut a = owner(&old, &root())?;
        assert_eq!(a.details_version(), "0");
        let before = read(a.checkpoint_json())?;
        assert_eq!(run(&mut a, &wrap()), "error");
        assert_eq!(read(a.checkpoint_json())?, before);
        let mut raw = root();
        raw["children"] = json!([{"kind":"element","type":"breditor/details","entityId":null,"properties":{"breditor/block-id":"d"},"children":[{"kind":"element","type":"breditor/details-summary","entityId":null,"properties":{"breditor/block-id":"s"},"children":[]},fixture::paragraph("p", "")]}]);
        assert!(owner(&old, &raw).is_err());
    }
    Ok(())
}

#[test]
fn wrap_toggle_enter_unwrap_undo_redo_and_restore() -> Result {
    let p = profile()?;
    let mut a = owner(&p, &root())?;
    let original = children(&a)?;
    assert_eq!(run(&mut a, &caret("p2", 1)), "selection");
    assert_eq!(run(&mut a, &wrap()), "content");
    let wrapped = children(&a)?;
    assert_eq!(wrapped[0]["type"], "breditor/details");
    assert_eq!(wrapped[0]["properties"]["breditor/details-open"], json!(true));
    assert_eq!(wrapped[0]["children"][0]["type"], "breditor/details-summary");
    // Collapsing moves the body caret to the summary end; collapsing again is a no-op.
    let collapse = command("setDetailsOpen", json!({"block":"d","open":false}));
    assert_eq!(run(&mut a, &collapse), "content");
    assert_eq!(run(&mut a, &collapse), "unchanged");
    let view: Value = serde_json::from_str(&read(a.observe().view_json())?)?;
    assert_eq!(view["selection"]["focus"]["block"], "s");
    // Enter in the summary expands and opens a fresh first body paragraph in one group.
    assert_eq!(run(&mut a, &command("enterDetailsBody", json!({"paragraph":"n"}))), "content");
    let entered = children(&a)?;
    assert_eq!(entered[0]["properties"]["breditor/details-open"], json!(true));
    assert_eq!(entered[0]["children"][1]["properties"]["breditor/block-id"], "n");
    assert_eq!(run(&mut a, &command("unwrapDetails", json!({"wrapper":"d"}))), "content");
    let unwrapped = children(&a)?;
    assert_eq!(unwrapped[0]["type"], "breditor/paragraph");
    assert_eq!(unwrapped[0]["properties"]["breditor/block-id"], "s");
    let mut b = p.restore_editor(&read(a.checkpoint_json())?).take_editor().ok_or("restore")?;
    assert_eq!(children(&b)?, unwrapped);
    for expected in [&entered, &wrapped, &original] {
        // Collapse and enter each count as one group: undo past the collapse lands on `wrapped`.
        if expected == &wrapped {
            assert_eq!(run(&mut b, &json!({"kind":"undo"})), "undo");
        }
        assert_eq!(run(&mut b, &json!({"kind":"undo"})), "undo");
        assert_eq!(&children(&b)?, expected);
    }
    assert_eq!(run(&mut b, &json!({"kind":"redo"})), "redo");
    assert_eq!(children(&b)?, wrapped);
    Ok(())
}

#[test]
fn insert_drafts_parents_and_malformed_intent() -> Result {
    let p = profile()?;
    let mut a = owner(&p, &root())?;
    let draft = json!({"kind":"details","block":"d","summary":"s","text":"Title","formatsJson":"[]","open":false,"body":[{"kind":"paragraph","block":"b","text":"","formatsJson":"[]"}]});
    let insert = command(
        "insertBlocks",
        json!({"position":{"parent":{"kind":"document"},"before":"q"},"blocks":[draft]}),
    );
    assert_eq!(run(&mut a, &insert), "content");
    let inserted = children(&a)?;
    assert_eq!(inserted[2]["type"], "breditor/details");
    assert!(inserted[2]["properties"].get("breditor/details-open").is_none());
    assert_eq!(inserted[2]["children"][0]["children"][0]["text"], "Title");
    // A section body is an explicit flow parent; inserting before its summary is refused.
    let into = |before: &str| {
        command(
            "insertBlocks",
            json!({"position":{"parent":{"kind":"details","block":"d"},"before":before},"blocks":[{"kind":"paragraph","block":"x","text":"","formatsJson":"[]"}]}),
        )
    };
    assert_eq!(run(&mut a, &into("s")), "error");
    assert_eq!(run(&mut a, &into("b")), "content");
    let before = read(a.checkpoint_json())?;
    for bad in [
        command("wrapDetails", json!({"first":"p","last":"p","wrapper":"w","summary":"t"})),
        command(
            "wrapDetails",
            json!({"first":"p","last":"p","wrapper":"w","summary":"t","open":true,"x":1}),
        ),
        command(
            "wrapDetails",
            json!({"first":"s","last":"s","wrapper":"w","summary":"t","open":true}),
        ),
        command(
            "wrapDetails",
            json!({"first":"p","last":"p","wrapper":"d","summary":"t","open":true}),
        ),
        command("unwrapDetails", json!({"wrapper":"p"})),
        command("setDetailsOpen", json!({"block":"p","open":true})),
        command("setDetailsOpen", json!({"block":"d","open":"yes"})),
        command("enterDetailsBody", json!({"paragraph":"n"})),
        command(
            "insertBlocks",
            json!({"position":{"parent":{"kind":"document"},"before":null},"blocks":[{"kind":"details","block":"e","summary":"f","text":"","formatsJson":"[]","open":true,"body":[]}]}),
        ),
    ] {
        assert_eq!(run(&mut a, &bad), "error", "{bad}");
    }
    assert_eq!(read(a.checkpoint_json())?, before);
    read(a.set_read_only(&a.observe(), true))?;
    assert_eq!(run(&mut a, &command("setDetailsOpen", json!({"block":"d","open":true}))), "error");
    read(a.set_read_only(&a.observe(), false))?;
    let stale = a.observe();
    assert_eq!(
        run(&mut a, &command("setDetailsOpen", json!({"block":"d","open":true}))),
        "content"
    );
    let late = command("setDetailsOpen", json!({"block":"d","open":false})).to_string();
    assert_eq!(a.execute(&stale, &late).status(), "error");
    Ok(())
}

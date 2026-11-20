//! Candidate V4 bookmarks and internal links through the Wasm descriptor, owner
//! capability, `setBookmark` / `renameBookmark` commands and `bookmarkIndexJson`.
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
fn link(text: &str, href: &str) -> Value {
    json!({"kind":"text","text":text,"formats":[{"type":"breditor-inline/link","properties":{"breditor-inline/href":href,"breditor-inline/new-window":false}}]})
}
fn root() -> Value {
    let mut heading = fixture::paragraph("h", "Intro");
    heading["properties"]["breditor/bookmark"] = json!("intro");
    let mut root = fixture::element(
        "document",
        "unused",
        vec![
            heading,
            fixture::element("paragraph", "p", vec![link("go", "#intro")]),
            fixture::paragraph("q", "Tail"),
        ],
    );
    root["properties"] = json!({"breditor/document-id":"room"});
    root
}
fn plain() -> Value {
    let mut root = fixture::element("document", "unused", vec![fixture::paragraph("q", "Tail")]);
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
fn index(a: &BreditorRichEditor) -> Result<Value> {
    Ok(serde_json::from_str(&read(a.observe().bookmark_index_json())?)?)
}

#[test]
fn v4_descriptor_and_owner_report_bookmarks_only_for_v4() -> Result {
    let p = profile()?;
    let d = descriptor(&p)?;
    assert_eq!(d["bookmarkVersion"], 1);
    assert_eq!(
        d["schemaFingerprint"],
        "sha256:40ed4c0716f9baab1ec30da8b5641623b8fbbdafc7e6f838f5b0496e01add372"
    );
    let a = owner(&p, &root())?;
    assert_eq!(a.bookmark_version(), "1");
    assert_eq!(
        index(&a)?,
        json!({"bookmarks":[{"name":"intro","block":"h"}],"links":[{"block":"p","target":"intro"}],"brokenLinks":[]})
    );
    for mut result in [
        BreditorRichProfile::from_standard_bootstrap_json_v1(&bootstrap(6)),
        BreditorRichProfile::from_standard_structural_bootstrap_json_v2(&bootstrap(7)),
        BreditorRichProfile::from_standard_layout_bootstrap_json_v3(&bootstrap(8)),
    ] {
        let old = result.take_profile().ok_or("old profile")?;
        assert!(descriptor(&old)?.get("bookmarkVersion").is_none());
        let mut a = owner(&old, &plain())?;
        assert_eq!(a.bookmark_version(), "0");
        assert!(a.observe().bookmark_index_json().take_value().is_none());
        let before = read(a.checkpoint_json())?;
        assert_eq!(run(&mut a, &command("setBookmark", json!({"block":"q","name":"x"}))), "error");
        assert_eq!(run(&mut a, &command("renameBookmark", json!({"from":"a","to":"b"}))), "error");
        assert_eq!(read(a.checkpoint_json())?, before);
        assert!(owner(&old, &root()).is_err());
    }
    Ok(())
}

#[test]
fn set_rename_clear_undo_redo_and_restore() -> Result {
    let p = profile()?;
    let mut a = owner(&p, &root())?;
    let original = children(&a)?;
    assert_eq!(run(&mut a, &command("setBookmark", json!({"block":"q","name":"tail"}))), "content");
    assert_eq!(children(&a)?[2]["properties"]["breditor/bookmark"], "tail");
    // Duplicate names are refused without publication.
    assert_eq!(run(&mut a, &command("setBookmark", json!({"block":"q","name":"intro"}))), "error");
    // Rename retargets the link in the same history group.
    assert_eq!(
        run(&mut a, &command("renameBookmark", json!({"from":"intro","to":"start"}))),
        "content"
    );
    let renamed = children(&a)?;
    assert_eq!(renamed[0]["properties"]["breditor/bookmark"], "start");
    assert_eq!(
        renamed[1]["children"][0]["formats"][0]["properties"]["breditor-inline/href"],
        "#start"
    );
    assert_eq!(index(&a)?["brokenLinks"], json!([]));
    let mut b = p.restore_editor(&read(a.checkpoint_json())?).take_editor().ok_or("restore")?;
    assert_eq!(run(&mut b, &json!({"kind":"undo"})), "undo");
    assert_eq!(children(&b)?[1], original[1]);
    assert_eq!(children(&b)?[0], original[0]);
    assert_eq!(run(&mut b, &json!({"kind":"redo"})), "redo");
    assert_eq!(children(&b)?, renamed);
    // Clearing the target leaves a reported dangling link.
    assert_eq!(run(&mut b, &command("setBookmark", json!({"block":"h","name":null}))), "content");
    assert_eq!(index(&b)?["brokenLinks"], json!([{"block":"p","target":"start"}]));
    assert_eq!(run(&mut b, &command("setBookmark", json!({"block":"h","name":null}))), "unchanged");
    Ok(())
}

#[test]
fn malformed_read_only_and_stale_intent() -> Result {
    let p = profile()?;
    let mut a = owner(&p, &root())?;
    let before = read(a.checkpoint_json())?;
    for bad in [
        command("setBookmark", json!({"block":"q"})),
        command("setBookmark", json!({"block":"q","name":"1x"})),
        command("setBookmark", json!({"block":"q","name":"x","extra":true})),
        command("setBookmark", json!({"block":"missing","name":"x"})),
        command("renameBookmark", json!({"from":"nope","to":"x"})),
        command("renameBookmark", json!({"from":"intro","to":"#x"})),
        command("renameBookmark", json!({"from":"intro"})),
        json!({"kind":"setBookmark","block":"q"}),
    ] {
        assert_eq!(run(&mut a, &bad), "error", "{bad}");
    }
    assert_eq!(read(a.checkpoint_json())?, before);
    read(a.set_read_only(&a.observe(), true))?;
    assert_eq!(run(&mut a, &command("setBookmark", json!({"block":"q","name":"x"}))), "error");
    read(a.set_read_only(&a.observe(), false))?;
    let stale = a.observe();
    assert_eq!(run(&mut a, &command("setBookmark", json!({"block":"q","name":"x"}))), "content");
    let late = command("renameBookmark", json!({"from":"intro","to":"y"})).to_string();
    assert_eq!(a.execute(&stale, &late).status(), "error");
    Ok(())
}

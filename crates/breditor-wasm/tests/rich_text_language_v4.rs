//! Candidate V4 text-run language through the Wasm descriptor, catalog and command boundary.
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
fn root() -> Value {
    let mut root = fixture::element(
        "document",
        "unused",
        vec![fixture::paragraph("p", "Hello world"), fixture::paragraph("q", "Other")],
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
fn language(value: &Value) -> Value {
    let mut command = json!({"kind":"setTextLanguage"});
    command["data"] = json!({"language": value});
    command
}
fn select(a: &mut BreditorRichEditor, block: &str, start: u32, end: u32) -> String {
    let point = |offset: u32| json!({"block":block,"offset":offset.to_string(),"affinity":"after"});
    run(
        a,
        &json!({"kind":"setSelection","selection":{"kind":"text","anchor":point(start),"focus":point(end)}}),
    )
}
fn runs(a: &BreditorRichEditor) -> Result<Value> {
    let d: Value = serde_json::from_str(&read(a.observe().document_json())?)?;
    Ok(d["root"]["children"][0]["children"].clone())
}
fn tagged(text: &str, tag: &str) -> Value {
    json!({"kind":"text","text":text,"formats":[{"type":"breditor/text-language","properties":{"breditor/language-tag":tag}}]})
}
fn plain(text: &str) -> Value {
    json!({"kind":"text","text":text,"formats":[]})
}

#[test]
fn v4_descriptor_catalog_and_owner_report_text_language_only_for_v4() -> Result {
    let p = profile()?;
    let d = descriptor(&p)?;
    assert_eq!(d["textLanguageVersion"], 1);
    assert_eq!(d["listNumberingVersion"], 1);
    assert_eq!(
        d["schemaFingerprint"],
        "sha256:6daf61c3c5a216bb4d831c8bd6b9b776044b0a4598a346270ecf6579373959c0"
    );
    let catalog: Value = serde_json::from_str(&read(p.inline_catalog_json())?)?;
    let format = catalog["formats"]
        .as_array()
        .ok_or("formats")?
        .iter()
        .find(|f| f["kind"] == "breditor/text-language")
        .ok_or("language format")?
        .clone();
    assert_eq!(
        format,
        json!({"kind":"breditor/text-language","revision":1,"properties":[{"name":"breditor/language-tag","presence":"required","valueType":{"kind":"string","minimumUtf8Bytes":2,"maximumUtf8Bytes":35}}]})
    );
    // The plain V4 factory carries the same native format.
    let plain =
        BreditorRichProfile::from_bootstrap_json_v4(&bootstrap(9)).take_profile().ok_or("plain")?;
    assert!(read(plain.inline_catalog_json())?.contains("breditor/text-language"));
    assert_eq!(owner(&p, &root())?.text_language_version(), "1");
    for mut result in [
        BreditorRichProfile::from_standard_bootstrap_json_v1(&bootstrap(6)),
        BreditorRichProfile::from_standard_structural_bootstrap_json_v2(&bootstrap(7)),
        BreditorRichProfile::from_standard_layout_bootstrap_json_v3(&bootstrap(8)),
    ] {
        let old = result.take_profile().ok_or("old profile")?;
        assert!(descriptor(&old)?.get("textLanguageVersion").is_none());
        assert!(!read(old.inline_catalog_json())?.contains("breditor/text-language"));
        let mut a = owner(&old, &root())?;
        assert_eq!(a.text_language_version(), "0");
        assert_eq!(select(&mut a, "p", 0, 5), "selection");
        let before = read(a.checkpoint_json())?;
        assert_eq!(run(&mut a, &language(&json!("en"))), "error");
        assert_eq!(read(a.checkpoint_json())?, before);
        let mut raw = root();
        raw["children"][0]["children"] = json!([tagged("Hello world", "en")]);
        assert!(owner(&old, &raw).is_err());
    }
    Ok(())
}

#[test]
fn set_replace_clear_undo_redo_restore_and_caret_pending_formats() -> Result {
    let p = profile()?;
    let mut a = owner(&p, &root())?;
    assert_eq!(select(&mut a, "p", 6, 11), "selection");
    assert_eq!(run(&mut a, &language(&json!("FR-ca"))), "content");
    assert_eq!(runs(&a)?, json!([plain("Hello "), tagged("world", "fr-CA")]));
    assert_eq!(run(&mut a, &language(&json!("fr-CA"))), "unchanged");
    let tagged_doc = runs(&a)?;
    assert_eq!(run(&mut a, &language(&json!("de"))), "content");
    assert_eq!(runs(&a)?, json!([plain("Hello "), tagged("world", "de")]));
    let checkpoint = read(a.checkpoint_json())?;
    let mut b = p.restore_editor(&checkpoint).take_editor().ok_or("restore")?;
    assert_eq!(runs(&b)?, json!([plain("Hello "), tagged("world", "de")]));
    assert_eq!(run(&mut b, &json!({"kind":"undo"})), "undo");
    assert_eq!(runs(&b)?, tagged_doc);
    assert_eq!(run(&mut b, &json!({"kind":"undo"})), "undo");
    assert_eq!(runs(&b)?, json!([plain("Hello world")]));
    assert_eq!(run(&mut b, &json!({"kind":"redo"})), "redo");
    assert_eq!(runs(&b)?, tagged_doc);
    assert_eq!(run(&mut a, &language(&Value::Null)), "content");
    assert_eq!(runs(&a)?, json!([plain("Hello world")]));
    assert_eq!(run(&mut a, &json!({"kind":"undo"})), "undo");
    assert_eq!(runs(&a)?, json!([plain("Hello "), tagged("world", "de")]));
    // A caret changes pending typing formats only.
    assert_eq!(select(&mut a, "p", 2, 2), "selection");
    assert_eq!(run(&mut a, &language(&json!("ja"))), "typing");
    assert_eq!(run(&mut a, &json!({"kind":"insertPlainText","text":"語"})), "content");
    assert_eq!(
        runs(&a)?,
        json!([plain("He"), tagged("語", "ja"), plain("llo "), tagged("world", "de")])
    );
    Ok(())
}

#[test]
fn read_only_stale_and_malformed_intent_is_refused_without_publication() -> Result {
    let p = profile()?;
    let mut a = owner(&p, &root())?;
    assert_eq!(select(&mut a, "p", 0, 5), "selection");
    let before = read(a.checkpoint_json())?;
    for data in [
        json!({}),
        json!({"language":"en_US"}),
        json!({"language":"x-private"}),
        json!({"language":"zh-yue"}),
        json!({"language":""}),
        json!({"language":7}),
        json!({"language":"en","extra":1}),
        json!(["en"]),
        json!("en"),
    ] {
        let mut command = json!({"kind":"setTextLanguage"});
        command["data"] = data.clone();
        assert_eq!(run(&mut a, &command), "error", "{data}");
    }
    let mut extra = language(&json!("en"));
    extra["block"] = json!("p");
    assert_eq!(run(&mut a, &extra), "error");
    assert_eq!(read(a.checkpoint_json())?, before);
    read(a.set_read_only(&a.observe(), true))?;
    let locked = read(a.checkpoint_json())?;
    assert_eq!(run(&mut a, &language(&json!("en"))), "error");
    assert_eq!(read(a.checkpoint_json())?, locked);
    read(a.set_read_only(&a.observe(), false))?;
    let stale = a.observe();
    assert_eq!(run(&mut a, &language(&json!("en"))), "content");
    assert_eq!(a.execute(&stale, &language(&json!("fr")).to_string()).status(), "error");
    Ok(())
}

//! Explicit bootstrap V9 candidate V4 and its guarded list-numbering command boundary.
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
    let item = |id: &str| {
        fixture::element("list-item", id, vec![fixture::paragraph(&format!("{id}-text"), id)])
    };
    let mut list = fixture::element("ordered-list", "list", vec![item("a"), item("b")]);
    list["properties"]["breditor/start"] = json!(1);
    let mut root = fixture::element("document", "unused", vec![list]);
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
fn numbering(data: Value) -> Value {
    let mut command = json!({"kind":"setListNumbering"});
    command["data"] = data;
    command
}
fn list(a: &BreditorRichEditor) -> Result<Value> {
    let d: Value = serde_json::from_str(&read(a.observe().document_json())?)?;
    Ok(d["root"]["children"][0]["properties"].clone())
}
#[test]
fn v9_is_explicit_and_old_factories_and_fingerprints_stay_exact() -> Result {
    let p = profile()?;
    let d = descriptor(&p)?;
    assert_eq!(d["richLanguageVersion"], 4);
    assert_eq!(d["taskStructureVersion"], 1);
    assert_eq!(d["blockLayoutVersion"], 1);
    assert_eq!(d["listNumberingVersion"], 1);
    assert_eq!(BreditorRichProfile::from_bootstrap_json_v4(&bootstrap(9)).status(), "profile");
    for revision in [1, 6, 7, 8, 10] {
        assert_eq!(
            BreditorRichProfile::from_bootstrap_json_v4(&bootstrap(revision)).status(),
            "error"
        );
        assert_eq!(
            BreditorRichProfile::from_standard_bootstrap_json_v4(&bootstrap(revision)).status(),
            "error"
        );
    }
    // Earlier factories never accept the V9 selector.
    for result in [
        BreditorRichProfile::from_bootstrap_json(&bootstrap(9)),
        BreditorRichProfile::from_standard_bootstrap_json_v1(&bootstrap(9)),
        BreditorRichProfile::from_standard_structural_bootstrap_json_v2(&bootstrap(9)),
        BreditorRichProfile::from_standard_layout_bootstrap_json_v3(&bootstrap(9)),
    ] {
        assert_eq!(result.status(), "error");
    }
    for (mut result, fingerprint, language) in [
        (
            BreditorRichProfile::from_standard_bootstrap_json_v1(&bootstrap(6)),
            "sha256:26dcb0992f0814e1d18491134f70c5857efc01b0c28d07015199490389090278",
            Value::Null,
        ),
        (
            BreditorRichProfile::from_standard_structural_bootstrap_json_v2(&bootstrap(7)),
            "sha256:2082e440c52cdef30f9fa46289cae3e378ea7673f05d20e6b71bb5797347b056",
            json!(2),
        ),
        (
            BreditorRichProfile::from_standard_layout_bootstrap_json_v3(&bootstrap(8)),
            "sha256:6667773591bde52ef650c498d908ccbe7e8d9303683be0ab7c55400db6dd52b4",
            json!(3),
        ),
    ] {
        let old = result.take_profile().ok_or("old profile")?;
        let d = descriptor(&old)?;
        assert_eq!(d["schemaFingerprint"], fingerprint);
        assert_eq!(d.get("richLanguageVersion").cloned().unwrap_or(Value::Null), language);
        assert!(d.get("listNumberingVersion").is_none());
        assert_ne!(d["schemaFingerprint"], descriptor(&p)?["schemaFingerprint"]);
        let mut a = owner(&old, &root())?;
        assert_eq!(a.list_numbering_version(), "0");
        let before = read(a.checkpoint_json())?;
        assert_eq!(run(&mut a, &numbering(json!({"list":"list","style":"lower-roman"}))), "error");
        assert_eq!(read(a.checkpoint_json())?, before);
        // Old owners also refuse a V4 document outright.
        let mut raw = root();
        raw["children"][0]["properties"]["breditor/list-style"] = json!(4);
        assert!(owner(&old, &raw).is_err());
    }
    Ok(())
}
#[test]
fn set_clear_undo_redo_read_only_and_restore_use_one_exact_history_group() -> Result {
    let p = profile()?;
    let mut a = owner(&p, &root())?;
    assert_eq!(a.list_numbering_version(), "1");
    assert_eq!(a.block_layout_version(), "1");
    let original = list(&a)?;
    let set = numbering(json!({"list":"list","style":"upper-alpha","reversed":true,"start":2}));
    assert_eq!(run(&mut a, &set), "content");
    let changed = list(&a)?;
    assert_eq!(changed["breditor/list-style"], 3);
    assert_eq!(changed["breditor/list-reversed"], true);
    assert_eq!(changed["breditor/start"], 2);
    assert_eq!(run(&mut a, &set), "unchanged");
    let checkpoint = read(a.checkpoint_json())?;
    let mut b = p.restore_editor(&checkpoint).take_editor().ok_or("restore")?;
    assert_eq!(list(&b)?, changed);
    assert_eq!(run(&mut b, &json!({"kind":"undo"})), "undo");
    assert_eq!(list(&b)?, original);
    assert_eq!(run(&mut b, &json!({"kind":"redo"})), "redo");
    assert_eq!(list(&b)?, changed);
    assert_eq!(
        run(&mut a, &numbering(json!({"list":"list","style":null,"reversed":false}))),
        "content"
    );
    let cleared = list(&a)?;
    assert!(cleared.get("breditor/list-style").is_none());
    assert!(cleared.get("breditor/list-reversed").is_none());
    assert_eq!(cleared["breditor/start"], 2);
    assert_eq!(run(&mut a, &json!({"kind":"undo"})), "undo");
    assert_eq!(list(&a)?, changed);
    assert_eq!(run(&mut a, &json!({"kind":"undo"})), "undo");
    assert_eq!(list(&a)?, original);
    // Read-only policy refuses the command before decoding it.
    read(a.set_read_only(&a.observe(), true))?;
    let before = read(a.checkpoint_json())?;
    assert_eq!(run(&mut a, &set), "error");
    assert_eq!(read(a.checkpoint_json())?, before);
    read(a.set_read_only(&a.observe(), false))?;
    // A stale observation is refused.
    let stale = a.observe();
    assert_eq!(run(&mut a, &set), "content");
    assert_eq!(
        a.execute(&stale, &numbering(json!({"list":"list","style":"decimal"})).to_string())
            .status(),
        "error"
    );
    Ok(())
}
#[test]
fn malformed_and_out_of_domain_intent_is_refused_without_publication() -> Result {
    let p = profile()?;
    let mut a = owner(&p, &root())?;
    let before = read(a.checkpoint_json())?;
    for data in [
        json!({"list":"list"}),
        json!({"list":"list","style":"disc"}),
        json!({"list":"list","style":4}),
        json!({"list":"list","reversed":"yes"}),
        json!({"list":"list","reversed":null}),
        json!({"list":"list","start":0}),
        json!({"list":"list","start":2_147_483_647}),
        json!({"list":"list","style":"decimal","extra":1}),
        json!({"list":"a","style":"decimal"}),
        json!({"list":"a-text","style":"decimal"}),
        json!({"list":"missing","style":"decimal"}),
        json!({"style":"decimal"}),
        json!("decimal"),
    ] {
        assert_eq!(run(&mut a, &numbering(data.clone())), "error", "{data}");
    }
    let mut extra = numbering(json!({"list":"list","style":"decimal"}));
    extra["block"] = json!("list");
    assert_eq!(run(&mut a, &extra), "error");
    assert_eq!(read(a.checkpoint_json())?, before);
    Ok(())
}

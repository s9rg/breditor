//! Explicit V8 factory and guarded layout boundary preserve older selectors and exact histories.
#![cfg(feature = "experimental-rich-content")]
#[path = "../../breditor-core/tests/support/coverage_fixture.rs"]
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
    BreditorRichProfile::from_standard_layout_bootstrap_json_v3(&bootstrap(8))
        .take_profile()
        .ok_or("profile".into())
}
fn owner(p: &BreditorRichProfile, root: &Value) -> Result<BreditorRichEditor> {
    let d: Value = serde_json::from_str(&read(p.descriptor_json())?)?;
    p.create_editor(&json!({"format":"breditor/document","formatVersion":2,"schema":d["schema"],"schemaFingerprint":d["schemaFingerprint"],"root":root}).to_string(), "100").take_editor().ok_or("owner".into())
}
fn run(a: &mut BreditorRichEditor, c: Value, status: &str) -> Result {
    let Value::Object(fields) = c else {
        return Err("command object".into());
    };
    let c = Value::Object(fields);
    let result = a.execute(&a.observe(), &c.to_string());
    if result.status() != status {
        return Err(format!("expected {status}; got {}", result.status()).into());
    }
    Ok(())
}
fn text(a: &str, x: u32, b: &str, y: u32) -> Value {
    json!({"kind":"text","anchor":{"block":a,"offset":x.to_string(),"affinity":"after"},"focus":{"block":b,"offset":y.to_string(),"affinity":"after"}})
}
fn select(a: &mut BreditorRichEditor, selection: Value) -> Result {
    let mut command = json!({"kind":"setSelection"});
    command["selection"] = selection;
    run(a, command, "selection")
}
fn state(a: &BreditorRichEditor) -> Result<Value> {
    Ok(serde_json::from_str(&read(a.observe().block_layout_state_json())?)?)
}
fn patch(a: &mut BreditorRichEditor, data: Value, status: &str) -> Result {
    let mut command = json!({"kind":"changeSelectionLayout"});
    command["data"] = data;
    run(a, command, status)
}
fn full() -> Value {
    json!({"alignment":"start","direction":"rtl","indent":12,"lineHeightPercent":300})
}
fn saved(a: &BreditorRichEditor) -> Result<String> {
    read(a.checkpoint_json())
}
#[test]
fn v8_is_explicit_old_factories_shapes_and_preexisting_fingerprints_stay_exact() -> Result {
    let p = profile()?;
    let d: Value = serde_json::from_str(&read(p.descriptor_json())?)?;
    assert_eq!(d["richLanguageVersion"], 3);
    assert_eq!(d["taskStructureVersion"], 1);
    assert_eq!(d["blockLayoutVersion"], 1);
    assert_eq!(
        BreditorRichProfile::from_layout_bootstrap_json_v3(&bootstrap(8)).status(),
        "profile"
    );
    for revision in [1, 6, 7, 9] {
        assert_eq!(
            BreditorRichProfile::from_layout_bootstrap_json_v3(&bootstrap(revision)).status(),
            "error"
        );
        assert_eq!(
            BreditorRichProfile::from_standard_layout_bootstrap_json_v3(&bootstrap(revision))
                .status(),
            "error"
        );
    }
    for result in [
        BreditorRichProfile::from_bootstrap_json(&bootstrap(8)),
        BreditorRichProfile::from_standard_bootstrap_json_v1(&bootstrap(8)),
        BreditorRichProfile::from_structural_bootstrap_json_v2(&bootstrap(8)),
        BreditorRichProfile::from_standard_structural_bootstrap_json_v2(&bootstrap(8)),
    ] {
        assert_eq!(result.status(), "error");
    }
    for (mut result, fingerprint) in [
        (
            BreditorRichProfile::from_standard_bootstrap_json_v1(&bootstrap(6)),
            "sha256:26dcb0992f0814e1d18491134f70c5857efc01b0c28d07015199490389090278",
        ),
        (
            BreditorRichProfile::from_standard_structural_bootstrap_json_v2(&bootstrap(7)),
            "sha256:2082e440c52cdef30f9fa46289cae3e378ea7673f05d20e6b71bb5797347b056",
        ),
    ] {
        let p = result.take_profile().ok_or("old profile")?;
        let d: Value = serde_json::from_str(&read(p.descriptor_json())?)?;
        assert_eq!(d["schemaFingerprint"], fingerprint);
        assert!(d.get("blockLayoutVersion").is_none());
        let mut root =
            fixture::element("document", "unused", vec![fixture::paragraph("p", "Text")]);
        root["properties"] = json!({"breditor/document-id":"room"});
        let mut a = owner(&p, &root)?;
        assert_eq!(a.block_layout_version(), "0");
        select(&mut a, text("p", 0, "p", 0))?;
        let before = saved(&a)?;
        patch(&mut a, full(), "error")?;
        assert_eq!(a.observe().block_layout_state_json().status(), "error");
        assert_eq!(saved(&a)?, before);
    }
    Ok(())
}
#[test]
fn covered_node_grid_code_and_empty_targets_keep_frozen_reads_and_exact_both_history_families()
-> Result {
    let p = profile()?;
    let cell = json!({"table":"t","row":"r1","column":"c1"});
    for selection in [
        text("empty", 0, "empty", 0),
        text("code", 5, "task-head", 2),
        json!({"kind":"node","block":"image"}),
        json!({"kind":"grid","anchor":cell,"focus":cell}),
    ] {
        for typing in [false, true] {
            let mut a = owner(&p, &fixture::root())?;
            assert_eq!(a.block_layout_version(), "1");
            if typing {
                read(a.enable_typing_history(&a.observe()))?;
            }
            select(&mut a, selection.clone())?;
            let frozen = a.observe();
            let before = saved(&a)?;
            let original = read(frozen.document_json())?;
            let old_state = read(frozen.block_layout_state_json())?;
            assert_eq!(saved(&a)?, before);
            patch(&mut a, full(), "content")?;
            assert_eq!(read(frozen.block_layout_state_json())?, old_state);
            let r = state(&a)?;
            assert_eq!(r["format"], "breditor/rich-block-layout-state");
            assert_eq!(r["alignment"]["value"], "start");
            assert_eq!(r["direction"]["value"], "rtl");
            assert_eq!(r["indent"]["value"], 12);
            let exact = saved(&a)?;
            patch(&mut a, full(), "unchanged")?;
            assert_eq!(saved(&a)?, exact);
            let mut b =
                if typing { p.restore_typing_editor(&exact) } else { p.restore_editor(&exact) }
                    .take_editor()
                    .ok_or("restore")?;
            for kind in ["undo", "redo", "undo", "redo"] {
                run(&mut a, json!({"kind":kind}), kind)?;
                run(&mut b, json!({"kind":kind}), kind)?;
                assert_eq!(saved(&a)?, saved(&b)?);
                if kind == "undo" {
                    assert_eq!(read(a.observe().document_json())?, original);
                }
            }
        }
    }
    Ok(())
}
#[test]
fn exact_guard_and_readonly_policy_precede_invalid_layout_payload_and_refusals_are_atomic() -> Result
{
    let p = profile()?;
    let mut a = owner(&p, &fixture::root())?;
    select(&mut a, text("q1", 1, "q1", 1))?;
    let stale = a.observe();
    patch(&mut a, full(), "content")?;
    let before = saved(&a)?;
    assert_eq!(a.execute(&stale, "not JSON").status(), "error");
    for input in [
        r#"{"kind":"changeSelectionLayout","data":{"alignment":"left","alignment":"right"}}"#,
        r#"{"kind":"changeSelectionLayout","data":{}}"#,
        r#"{"kind":"changeSelectionLayout","data":{"alignment":"center","targets":["q1"]}}"#,
        r#"{"kind":"changeSelectionLayout","data":{"direction":"rtl"},"block":"q1"}"#,
        r#"{"kind":"changeSelectionLayout","data":{"indent":13}}"#,
        r#"{"kind":"changeSelectionLayout","data":{"lineHeightPercent":99}}"#,
    ] {
        assert_eq!(a.execute(&a.observe(), input).status(), "error");
        assert_eq!(saved(&a)?, before);
    }
    read(a.set_read_only(&a.observe(), true))?;
    let before = saved(&a)?;
    patch(&mut a, full(), "error")?;
    assert_eq!(state(&a)?["alignment"]["value"], "start");
    assert_eq!(saved(&a)?, before);
    Ok(())
}
#[test]
fn pending_inline_style_is_independent_and_keep_and_clear_never_invent_defaults() -> Result {
    let p = profile()?;
    let mut a = owner(&p, &fixture::root())?;
    select(&mut a, text("empty", 0, "empty", 0))?;
    run(
        &mut a,
        json!({"kind":"setPendingFormats","formats":[{"type":"breditor/strong","properties":{}}]}),
        "typing",
    )?;
    let old: Value = serde_json::from_str(&read(a.observe().view_json())?)?;
    patch(&mut a, full(), "content")?;
    let new: Value = serde_json::from_str(&read(a.observe().view_json())?)?;
    assert_eq!(old["pendingFormatsJson"], new["pendingFormatsJson"]);
    patch(&mut a, json!({"alignment":null,"indent":0}), "content")?;
    let r = state(&a)?;
    assert_eq!(r["alignment"], json!({"kind":"uniform","value":null}));
    assert_eq!(r["indent"]["value"], 0);
    assert_eq!(r["direction"]["value"], "rtl");
    assert_eq!(r["lineHeightPercent"]["value"], 300);
    let checkpoint = saved(&a)?;
    let mut b = p.restore_editor(&checkpoint).take_editor().ok_or("restore")?;
    for kind in ["undo", "redo"] {
        run(&mut a, json!({"kind":kind}), kind)?;
        run(&mut b, json!({"kind":kind}), kind)?;
        assert_eq!(saved(&a)?, saved(&b)?);
    }
    Ok(())
}

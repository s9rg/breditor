//! Closed optional Wasm selection intent, frozen native reads and original exact history.
#![cfg(feature = "experimental-rich-content")]
#[path = "../../breditor-core/tests/support/coverage_fixture.rs"]
mod fixture;
use breditor_wasm::{BreditorRichEditor, BreditorRichProfile, BreditorStringResult};
use serde_json::{Value, json};
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;
fn read(mut r: BreditorStringResult) -> Result<String> {
    r.take_value().ok_or("value".into())
}
fn setup() -> Result<(BreditorRichProfile, BreditorRichEditor)> {
    let config=json!({"format":"breditor/profile-bootstrap","formatVersion":7,"schema":{"name":"example/coverage-wasm","version":1},"extensions":[]}).to_string();
    let p = BreditorRichProfile::from_standard_structural_bootstrap_json_v2(&config)
        .take_profile()
        .ok_or("profile")?;
    let b: Value = serde_json::from_str(&read(p.descriptor_json())?)?;
    let input=json!({"format":"breditor/document","formatVersion":2,"schema":b["schema"],"schemaFingerprint":b["schemaFingerprint"],"root":fixture::root()}).to_string();
    let a = p.create_editor(&input, "100").take_editor().ok_or("editor")?;
    Ok((p, a))
}
fn run(a: &mut BreditorRichEditor, c: &Value, status: &str) -> Result {
    let r = a.execute(&a.observe(), &c.to_string());
    if r.status() != status {
        return Err(format!("expected {status}, got {}", r.status()).into());
    }
    Ok(())
}
fn grid() -> Value {
    let c = json!({"table":"t","row":"r1","column":"c1"});
    json!({"kind":"grid","anchor":c,"focus":c})
}
fn changes() -> Value {
    json!({"changes":[{"kind":"set","formatsJson":"[{\"type\":\"breditor/strong\",\"properties\":{}}]"}]})
}
#[test]
fn native_grid_intent_and_frozen_distinct_reads_recover_in_original_histories() -> Result {
    for typing in [false, true] {
        let (p, mut a) = setup()?;
        assert_eq!(a.selection_formatting_version(), "1");
        if typing {
            read(a.enable_typing_history(&a.observe()))?;
        }
        run(&mut a, &json!({"kind":"setSelection","selection":grid()}), "selection")?;
        let frozen = a.observe();
        let before = read(a.checkpoint_json())?;
        let before_doc = read(a.observe().document_json())?;
        let r: Value = serde_json::from_str(&read(frozen.selection_coverage_json("selection"))?)?;
        assert_eq!(r["selectedUtf16"], "16");
        assert_eq!(r["text"].as_array().ok_or("text")?.len(), 4);
        let old: Value =
            serde_json::from_str(&read(frozen.inline_format_state_json("breditor/strong"))?)?;
        assert_eq!(old["state"]["kind"], "unavailable");
        let original = read(frozen.selection_format_state_json("breditor/strong"))?;
        assert_eq!(serde_json::from_str::<Value>(&original)?["state"]["kind"], "unset");
        run(&mut a, &json!({"kind":"changeSelectionFormats","data":changes()}), "content")?;
        assert_eq!(read(frozen.selection_format_state_json("breditor/strong"))?, original);
        let state: Value = serde_json::from_str(&read(
            a.observe().selection_format_state_json("breditor/strong"),
        )?)?;
        assert_eq!(state["state"]["kind"], "uniform");
        let checkpoint = read(a.checkpoint_json())?;
        let mut b = if typing {
            p.restore_typing_editor(&checkpoint)
        } else {
            p.restore_editor(&checkpoint)
        }
        .take_editor()
        .ok_or("restore")?;
        for kind in ["undo", "redo", "undo", "redo"] {
            run(&mut a, &json!({"kind":kind}), kind)?;
            run(&mut b, &json!({"kind":kind}), kind)?;
            assert_eq!(read(a.checkpoint_json())?, read(b.checkpoint_json())?);
            if kind == "undo" {
                assert_eq!(read(a.observe().document_json())?, before_doc);
            }
        }
        assert_ne!(read(a.checkpoint_json())?, before);
    }
    Ok(())
}
#[test]
fn invalid_payload_targets_duplicate_changes_scope_and_policy_refuse_without_publication() -> Result
{
    let (_, mut a) = setup()?;
    run(&mut a, &json!({"kind":"setSelection","selection":grid()}), "selection")?;
    for data in [
        json!({"changes":[]}),
        json!({"changes":changes()["changes"],"targets":[]}),
        json!({"changes":[changes()["changes"][0].clone(),changes()["changes"][0].clone()]}),
        json!({"changes":[{"kind":"remove","format":"breditor/strong"}]}),
    ] {
        let before = read(a.checkpoint_json())?;
        run(&mut a, &json!({"kind":"changeSelectionFormats","data":data}), "error")?;
        assert_eq!(read(a.checkpoint_json())?, before);
    }
    assert_eq!(a.observe().selection_coverage_json("all").status(), "error");
    let stale = a.observe();
    read(a.set_read_only(&a.observe(), true))?;
    let before = read(a.checkpoint_json())?;
    assert_eq!(a.execute(&stale, "notJSON").status(), "error");
    run(&mut a, &json!({"kind":"changeSelectionFormats","data":changes()}), "error")?;
    assert_eq!(read(a.checkpoint_json())?, before);
    assert_eq!(a.observe().selection_coverage_json("document").status(), "value");
    Ok(())
}

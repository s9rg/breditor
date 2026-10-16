//! Strict additive code-exit command uses unchanged exact local history and recovery.
#![cfg(feature = "experimental-rich-content")]
use breditor_wasm::{BreditorRichEditor, BreditorRichProfile, BreditorStringResult};
use serde_json::{Value, json};
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;
fn read(mut r: BreditorStringResult) -> Result<String> {
    r.take_value().ok_or("value".into())
}
fn profile(language: u32) -> Result<BreditorRichProfile> {
    let input=json!({"format":"breditor/profile-bootstrap","formatVersion":if language==2{7}else{6},"schema":{"name":"example/code-exit-wasm","version":1},"extensions":[]}).to_string();
    let mut r = if language == 2 {
        BreditorRichProfile::from_structural_bootstrap_json_v2(&input)
    } else {
        BreditorRichProfile::from_bootstrap_json(&input)
    };
    r.take_profile().ok_or("profile".into())
}
fn create(p: &BreditorRichProfile, language: u32) -> Result<BreditorRichEditor> {
    let d: Value = serde_json::from_str(&read(p.descriptor_json())?)?;
    let root: Value = serde_json::from_str(if language == 2 {
        include_str!("../../breditor-core/tests/fixtures/rich-code-exit-root.json")
    } else {
        include_str!("../../breditor-core/tests/fixtures/rich-local-root.json")
    })?;
    p.create_editor(&json!({"format":"breditor/document","formatVersion":2,"schema":d["schema"],"schemaFingerprint":d["schemaFingerprint"],"root":root}).to_string(),"100").take_editor().ok_or("editor".into())
}
fn range(block: &str, a: &str, b: &str) -> Value {
    json!({"kind":"text","anchor":{"block":block,"offset":a,"affinity":"after"},"focus":{"block":block,"offset":b,"affinity":"after"}})
}
fn run(a: &mut BreditorRichEditor, v: &Value, status: &str) -> Result {
    let r = a.execute(&a.observe(), &v.to_string());
    if r.status() != status {
        return Err(format!("expected {status}, received {}", r.status()).into());
    }
    Ok(())
}
fn checkpoint(a: &BreditorRichEditor) -> Result<String> {
    read(a.checkpoint_json())
}

#[test]
fn native_capability_all_flows_and_exact_future_recovery_use_only_original_actions() -> Result {
    let p = profile(2)?;
    for block in ["code-root", "code-cell", "code-quote", "code-list", "code-task", "code-last"] {
        let mut a = create(&p, 2)?;
        assert_eq!(a.code_exit_version(), "1");
        run(&mut a, &json!({"kind":"setSelection","selection":range(block,"0","0")}), "selection")?;
        let before = read(a.observe().document_json())?;
        run(&mut a, &json!({"kind":"exitCodeBlock","data":{"paragraph":"fresh"}}), "content")?;
        let after = read(a.observe().document_json())?;
        let view: Value = serde_json::from_str(&read(a.observe().view_json())?)?;
        assert_eq!(view["selection"], range("fresh", "0", "0"));
        assert_eq!(view["undoDepth"], 1);
        assert_eq!(view["pendingFormatsJson"], Value::Null);
        let saved = checkpoint(&a)?;
        let mut b = p.restore_editor(&saved).take_editor().ok_or("restored")?;
        assert_eq!(checkpoint(&b)?, saved);
        for (kind, status, document) in [
            ("undo", "undo", &before),
            ("redo", "redo", &after),
            ("undo", "undo", &before),
            ("redo", "redo", &after),
        ] {
            run(&mut a, &json!({"kind":kind}), status)?;
            run(&mut b, &json!({"kind":kind}), status)?;
            assert_eq!(read(a.observe().document_json())?, *document);
            assert_eq!(checkpoint(&a)?, checkpoint(&b)?);
        }
    }
    Ok(())
}

#[test]
fn closed_field_sets_unknown_duplicates_and_unsupported_targets_are_atomic() -> Result {
    let p = profile(2)?;
    let mut a = create(&p, 2)?;
    run(
        &mut a,
        &json!({"kind":"setSelection","selection":range("code-root","1","1")}),
        "selection",
    )?;
    let before = checkpoint(&a)?;
    for bad in [
        r#"{"kind":"exitCodeBlock"}"#,
        r#"{"kind":"exitCodeBlock","data":null}"#,
        r#"{"kind":"exitCodeBlock","data":{}}"#,
        r#"{"kind":"exitCodeBlock","data":{"paragraph":1}}"#,
        r#"{"kind":"exitCodeBlock","data":{"paragraph":"fresh","paragraph":"other"}}"#,
        r#"{"kind":"exitCodeBlock","data":{"paragraph":"fresh","before":null}}"#,
        r#"{"kind":"exitCodeBlock","text":"x","data":{"paragraph":"fresh"}}"#,
        r#"{"kind":"exitCodeBlock","data":{"paragraph":"p"}}"#,
    ] {
        assert_eq!(a.execute(&a.observe(), bad).status(), "error");
        assert_eq!(checkpoint(&a)?, before);
    }
    for selection in [
        range("code-root", "0", "1"),
        range("p", "0", "0"),
        json!({"kind":"node","block":"code-root"}),
    ] {
        run(&mut a, &json!({"kind":"setSelection","selection":selection}), "selection")?;
        let before = checkpoint(&a)?;
        run(&mut a, &json!({"kind":"exitCodeBlock","data":{"paragraph":"fresh"}}), "error")?;
        assert_eq!(checkpoint(&a)?, before);
    }
    let old = profile(1)?;
    let mut a = create(&old, 1)?;
    run(&mut a, &json!({"kind":"setSelection","selection":range("p","0","0")}), "selection")?;
    let before = checkpoint(&a)?;
    run(&mut a, &json!({"kind":"exitCodeBlock","data":{"paragraph":"fresh"}}), "error")?;
    assert_eq!(checkpoint(&a)?, before);
    Ok(())
}

#[test]
fn stale_and_read_only_reject_before_code_exit_payload_admission() -> Result {
    let p = profile(2)?;
    let mut a = create(&p, 2)?;
    run(
        &mut a,
        &json!({"kind":"setSelection","selection":range("code-root","1","1")}),
        "selection",
    )?;
    let stale = a.observe();
    read(a.set_read_only(&a.observe(), true))?;
    let before = checkpoint(&a)?;
    assert_eq!(
        a.execute(&stale, "not JSON").error().ok_or("error")?.code(),
        "breditor_rich.stale_observation"
    );
    let r = a.execute(&a.observe(), r#"{"kind":"exitCodeBlock","data":null}"#);
    assert_eq!(r.error().ok_or("error")?.code(), "breditor_rich.read_only");
    assert_eq!(checkpoint(&a)?, before);
    Ok(())
}

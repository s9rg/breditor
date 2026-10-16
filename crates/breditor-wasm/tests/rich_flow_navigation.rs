//! Closed native flow commands, selection-only read-only access and unchanged exact history.
#![cfg(feature = "experimental-rich-content")]
use breditor_wasm::{BreditorRichEditor, BreditorRichProfile, BreditorStringResult};
use serde_json::{Value, json};
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;
fn read(mut value: BreditorStringResult) -> Result<String> {
    value.take_value().ok_or("value".into())
}
fn setup(language: u32) -> Result<(BreditorRichProfile, BreditorRichEditor)> {
    let bootstrap=json!({"format":"breditor/profile-bootstrap","formatVersion":if language==2{7}else{6},"schema":{"name":"example/flow-wasm","version":1},"extensions":[]}).to_string();
    let mut result = if language == 2 {
        BreditorRichProfile::from_structural_bootstrap_json_v2(&bootstrap)
    } else {
        BreditorRichProfile::from_bootstrap_json(&bootstrap)
    };
    let profile = result.take_profile().ok_or("profile")?;
    let binding: Value = serde_json::from_str(&read(profile.descriptor_json())?)?;
    let root: Value = serde_json::from_str(if language == 2 {
        include_str!("../../breditor-core/tests/fixtures/rich-code-exit-root.json")
    } else {
        include_str!("../../breditor-core/tests/fixtures/rich-local-root.json")
    })?;
    let doc=json!({"format":"breditor/document","formatVersion":2,"schema":binding["schema"],"schemaFingerprint":binding["schemaFingerprint"],"root":root}).to_string();
    let editor = profile.create_editor(&doc, "100").take_editor().ok_or("editor")?;
    Ok((profile, editor))
}
fn run(a: &mut BreditorRichEditor, command: &Value, status: &str) -> Result {
    let actual = a.execute(&a.observe(), &command.to_string());
    if actual.status() != status {
        return Err(format!("expected {status}, got {}", actual.status()).into());
    }
    Ok(())
}
fn saved(a: &BreditorRichEditor) -> Result<String> {
    read(a.checkpoint_json())
}
fn range(block: &str, start: &str, end: &str) -> Value {
    json!({"kind":"text","anchor":{"block":block,"offset":start,"affinity":"after"},"focus":{"block":block,"offset":end,"affinity":"after"}})
}

#[test]
fn exact_capability_original_v1_and_v2_native_movement_and_adjacent_insertion_recover() -> Result {
    for language in [1, 2] {
        for side in ["before", "after"] {
            let (profile, mut a) = setup(language)?;
            assert_eq!(a.flow_navigation_version(), "1");
            run(
                &mut a,
                &json!({"kind":"setSelection","selection":{"kind":"node","block":"table-block"}}),
                "selection",
            )?;
            let original = read(a.observe().document_json())?;
            run(
                &mut a,
                &json!({"kind":"insertParagraphAdjacent","data":{"paragraph":"fresh","side":side}}),
                "content",
            )?;
            let view: Value = serde_json::from_str(&read(a.observe().view_json())?)?;
            assert_eq!(view["selection"], range("fresh", "0", "0"));
            assert_eq!(view["undoDepth"], 1);
            let mut b = profile.restore_editor(&saved(&a)?).take_editor().ok_or("restored")?;
            for kind in ["undo", "redo", "undo", "redo"] {
                run(&mut a, &json!({"kind":kind}), kind)?;
                run(&mut b, &json!({"kind":kind}), kind)?;
                assert_eq!(saved(&a)?, saved(&b)?);
                if kind == "undo" {
                    assert_eq!(read(a.observe().document_json())?, original);
                }
            }
        }
    }
    let (_, mut a) = setup(2)?;
    run(
        &mut a,
        &json!({"kind":"setSelection","selection":range("code-root","7","7")}),
        "selection",
    )?;
    run(&mut a, &json!({"kind":"navigateFlow","data":{"movement":"after"}}), "selection")?;
    let view: Value = serde_json::from_str(&read(a.observe().view_json())?)?;
    assert_eq!(view["selection"], json!({"kind":"node","block":"root-next"}));
    assert_eq!(view["undoDepth"], 0);
    read(a.set_read_only(&a.observe(), true))?;
    run(&mut a, &json!({"kind":"navigateFlow","data":{"movement":"after"}}), "selection")?;
    let view: Value = serde_json::from_str(&read(a.observe().view_json())?)?;
    assert_eq!(view["selection"], range("code-quote", "0", "0"));
    let before = saved(&a)?;
    run(&mut a, &json!({"kind":"navigateFlow","data":{"movement":"after"}}), "unchanged")?;
    assert_eq!(saved(&a)?, before);
    Ok(())
}

#[test]
fn ranges_are_not_collapsed_and_closed_command_fields_reject_atomically() -> Result {
    let (_, mut a) = setup(2)?;
    run(
        &mut a,
        &json!({"kind":"setSelection","selection":range("code-root","7","0")}),
        "selection",
    )?;
    let before = saved(&a)?;
    run(&mut a, &json!({"kind":"navigateFlow","data":{"movement":"after"}}), "unchanged")?;
    assert_eq!(saved(&a)?, before);
    run(
        &mut a,
        &json!({"kind":"setSelection","selection":{"kind":"node","block":"root-next"}}),
        "selection",
    )?;
    let before = saved(&a)?;
    for bad in [
        r#"{"kind":"navigateFlow","data":{"movement":"right"}}"#,
        r#"{"kind":"navigateFlow","data":{"movement":"after","extend":true}}"#,
        r#"{"kind":"navigateFlow","data":{"movement":"after","movement":"before"}}"#,
        r#"{"kind":"navigateFlow","data":{"movement":1}}"#,
        r#"{"kind":"navigateFlow","data":null}"#,
        r#"{"kind":"navigateFlow","text":"x","data":{"movement":"after"}}"#,
        r#"{"kind":"insertParagraphAdjacent","data":{"paragraph":"fresh","side":"left"}}"#,
        r#"{"kind":"insertParagraphAdjacent","data":{"paragraph":"fresh","side":"after","extra":0}}"#,
        r#"{"kind":"insertParagraphAdjacent","data":{"paragraph":"fresh","side":"after","paragraph":"other"}}"#,
        r#"{"kind":"insertParagraphAdjacent","data":{"paragraph":"p","side":"after"}}"#,
    ] {
        assert_eq!(a.execute(&a.observe(), bad).status(), "error");
        assert_eq!(saved(&a)?, before);
    }
    Ok(())
}

#[test]
fn stale_guards_and_read_only_policy_precede_native_payload_planning() -> Result {
    let (_, mut a) = setup(2)?;
    run(
        &mut a,
        &json!({"kind":"setSelection","selection":{"kind":"node","block":"root-next"}}),
        "selection",
    )?;
    let stale = a.observe();
    read(a.set_read_only(&a.observe(), true))?;
    let before = saved(&a)?;
    let rejected = a.execute(&stale, "bad");
    assert_eq!(rejected.status(), "error");
    for input in [
        json!({"kind":"insertParagraphAdjacent","data":null}),
        json!({"kind":"insertParagraphAdjacent","data":{"paragraph":"fresh","side":"after"}}),
    ] {
        let rejected = a.execute(&a.observe(), &input.to_string());
        assert_eq!(rejected.status(), "error");
        let error = rejected.error().ok_or("error")?;
        assert_eq!(error.code(), "breditor_rich.read_only");
        assert_eq!(saved(&a)?, before);
    }
    Ok(())
}

//! Additive grouped local Wasm commands and explicit recovery; default factories stay exact.
#![cfg(feature = "experimental-rich-content")]
use breditor_wasm::{BreditorRichEditor, BreditorRichProfile, BreditorStringResult};
use serde_json::{Value, json};
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;
fn read(mut result: BreditorStringResult) -> Result<String> {
    if result.status() != "value" {
        return Err("string result".into());
    }
    result.take_value().ok_or_else(|| "value".into())
}
fn view(owner: &BreditorRichEditor) -> Result<Value> {
    Ok(serde_json::from_str(&read(owner.observe().view_json())?)?)
}
fn profile(language: u32) -> Result<BreditorRichProfile> {
    let input=json!({"format":"breditor/profile-bootstrap","formatVersion":if language==1 {6}else{7},"schema":{"name":"example/typing-wasm","version":1},"extensions":[]}).to_string();
    let mut result = if language == 1 {
        BreditorRichProfile::from_bootstrap_json(&input)
    } else {
        BreditorRichProfile::from_structural_bootstrap_json_v2(&input)
    };
    result.take_profile().ok_or_else(|| "profile".into())
}
fn owner(profile: &BreditorRichProfile) -> Result<BreditorRichEditor> {
    let binding: Value = serde_json::from_str(&read(profile.descriptor_json())?)?;
    let document=json!({"format":"breditor/document","formatVersion":2,"schema":binding["schema"],"schemaFingerprint":binding["schemaFingerprint"],"root":serde_json::from_str::<Value>(include_str!("../../breditor-core/tests/fixtures/rich-local-root.json"))?}).to_string();
    profile.create_editor(&document, "100").take_editor().ok_or_else(|| "owner".into())
}
fn point(offset: &str) -> Value {
    json!({"block":"p","offset":offset,"affinity":"after"})
}
fn range(start: &str, end: &str) -> Value {
    json!({"kind":"text","anchor":point(start),"focus":point(end)})
}
fn run(owner: &mut BreditorRichEditor, request: &Value, status: &str) -> Result {
    let result = owner.execute(&owner.observe(), &request.to_string());
    if result.status() != status {
        return Err(format!("expected {status}, received {}", result.status()).into());
    }
    Ok(())
}
fn insert(owner: &mut BreditorRichEditor, text: &str, clock: &str) -> Result {
    run(owner, &json!({"kind":"insertTypingText","data":{"text":text,"clockMs":clock}}), "content")
}

#[test]
fn explicit_capability_and_decimal_clock_preserve_frozen_views_and_grouped_undo() -> Result {
    for language in [1, 2] {
        let profile = profile(language)?;
        let mut a = owner(&profile)?;
        assert_eq!(a.typing_history_version(), "1");
        let old = a.observe();
        assert!(view(&a)?.get("historyGrouping").is_none());
        assert_eq!(read(a.enable_typing_history(&old))?, "true");
        assert!(
            serde_json::from_str::<Value>(&read(old.view_json())?)?
                .get("historyGrouping")
                .is_none()
        );
        assert_eq!(read(a.enable_typing_history(&a.observe()))?, "false");
        run(&mut a, &json!({"kind":"setSelection","selection":range("1","1")}), "selection")?;
        insert(&mut a, "A", "9007199254740993")?;
        insert(&mut a, "🙂", "9007199254741743")?;
        assert_eq!(view(&a)?["undoDepth"], 1);
        assert_eq!(view(&a)?["historyStepCount"], 2);
        insert(&mut a, "B", "9007199254742494")?;
        assert_eq!(view(&a)?["undoDepth"], 2);
        let frozen = a.observe();
        let before = read(frozen.document_json())?;
        assert_eq!(read(a.close_typing_group(&frozen))?, "true");
        assert_eq!(read(a.close_typing_group(&a.observe()))?, "false");
        let stale = a.execute(&frozen, "not JSON");
        assert_eq!(stale.error().ok_or("stale")?.code(), "breditor_rich.stale_observation");
        let deletion = |selection| json!({"kind":"deleteTypingRange","data":{"selection":selection,"direction":"backward","clockMs":"9007199254742495"}});
        run(&mut a, &deletion(range("4", "5")), "content")?;
        run(&mut a, &deletion(range("4", "2")), "content")?;
        assert_eq!(view(&a)?["undoDepth"], 3);
        run(&mut a, &json!({"kind":"undo"}), "undo")?;
        assert_eq!(read(a.observe().document_json())?, before);
        assert_eq!(view(&a)?["selection"]["focus"]["offset"], "5");
        assert_eq!(
            serde_json::from_str::<Value>(&read(frozen.view_json())?)?["historyStepCount"],
            3
        );
    }
    Ok(())
}

#[test]
fn typed_shapes_disabled_mode_and_read_only_fail_atomically() -> Result {
    let profile = profile(1)?;
    let mut a = owner(&profile)?;
    run(&mut a, &json!({"kind":"setSelection","selection":range("1","1")}), "selection")?;
    let request = json!({"kind":"insertTypingText","data":{"text":"X","clockMs":"0"}});
    assert_eq!(
        a.execute(&a.observe(), &request.to_string()).error().ok_or("disabled")?.code(),
        "breditor_rich.typing_history_disabled"
    );
    assert_eq!(read(a.enable_typing_history(&a.observe()))?, "true");
    let saved = read(a.checkpoint_json())?;
    for clock in [
        json!(0),
        json!(null),
        json!("01"),
        json!("-1"),
        json!("18446744073709551616"),
        json!("1.0"),
    ] {
        let bad = json!({"kind":"insertTypingText","data":{"text":"X","clockMs":clock}});
        assert_eq!(a.execute(&a.observe(), &bad.to_string()).status(), "error");
        assert_eq!(read(a.checkpoint_json())?, saved);
    }
    for bad in [
        json!({"kind":"insertTypingText","data":{"text":"X","clockMs":"1","extra":true}}),
        json!({"kind":"insertTypingText","text":"X"}),
        json!({"kind":"deleteTypingRange","data":{"selection":range("1","2"),"direction":"sideways","clockMs":"1"}}),
        json!({"kind":"deleteTypingRange","data":{"selection":range("1","2"),"direction":"forward","clockMs":"1"}}),
    ] {
        assert_eq!(a.execute(&a.observe(), &bad.to_string()).status(), "error");
        assert_eq!(read(a.checkpoint_json())?, saved);
    }
    assert_eq!(
        a.execute(
            &a.observe(),
            r#"{"kind":"insertTypingText","data":{"text":"X","clockMs":"1","clockMs":"2"}}"#
        )
        .status(),
        "error"
    );
    read(a.set_read_only(&a.observe(), true))?;
    let saved = read(a.checkpoint_json())?;
    assert_eq!(
        a.execute(&a.observe(), &request.to_string()).error().ok_or("read only")?.code(),
        "breditor_rich.read_only"
    );
    assert_eq!(read(a.checkpoint_json())?, saved);
    Ok(())
}

#[test]
fn grouped_checkpoint_uses_explicit_factory_and_retains_exact_future_history() -> Result {
    for language in [1, 2] {
        let profile = profile(language)?;
        let mut a = owner(&profile)?;
        let original = read(a.checkpoint_json())?;
        assert_eq!(profile.restore_typing_editor(&original).status(), "error");
        read(a.enable_typing_history(&a.observe()))?;
        run(&mut a, &json!({"kind":"setSelection","selection":range("1","1")}), "selection")?;
        insert(&mut a, "Q", "1")?;
        insert(&mut a, "🙂", "2")?;
        run(&mut a, &json!({"kind":"insertPlainText","text":"Paste"}), "content")?;
        run(&mut a, &json!({"kind":"undo"}), "undo")?;
        let checkpoint = read(a.checkpoint_json())?;
        assert_eq!(
            serde_json::from_str::<Value>(&checkpoint)?["format"],
            "breditor/rich-typing-session"
        );
        assert_eq!(profile.restore_editor(&checkpoint).status(), "error");
        let mut b = profile.restore_typing_editor(&checkpoint).take_editor().ok_or("restore")?;
        assert_eq!(read(b.checkpoint_json())?, checkpoint);
        for kind in ["redo", "undo", "undo", "redo", "redo"] {
            run(&mut a, &json!({"kind":kind}), kind)?;
            run(&mut b, &json!({"kind":kind}), kind)?;
            assert_eq!(read(a.checkpoint_json())?, read(b.checkpoint_json())?);
        }
    }
    Ok(())
}

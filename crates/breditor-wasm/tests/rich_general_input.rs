//! Closed general input commands retain actual before-UI and exact old local history formats.
#![cfg(feature = "experimental-rich-content")]
#[path = "../../breditor-core/tests/support/coverage_fixture.rs"]
mod fixture;
use breditor_wasm::{BreditorRichEditor, BreditorRichProfile, BreditorStringResult};
use serde_json::{Value, json};
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;
fn read(mut r: BreditorStringResult) -> Result<String> {
    r.take_value().ok_or("value".into())
}
fn target(a: &str, x: &str, b: &str, y: &str) -> Value {
    json!({"kind":"text","anchor":{"block":a,"offset":x,"affinity":"after"},"focus":{"block":b,"offset":y,"affinity":"after"}})
}
fn setup() -> Result<(BreditorRichProfile, BreditorRichEditor)> {
    let input=json!({"format":"breditor/profile-bootstrap","formatVersion":8,"schema":{"name":"example/general-input-wasm","version":1},"extensions":[]}).to_string();
    let p = BreditorRichProfile::from_standard_layout_bootstrap_json_v3(&input)
        .take_profile()
        .ok_or("profile")?;
    let binding: Value = serde_json::from_str(&read(p.descriptor_json())?)?;
    let input=json!({"format":"breditor/document","formatVersion":2,"schema":binding["schema"],"schemaFingerprint":binding["schemaFingerprint"],"root":fixture::root()}).to_string();
    let a = p.create_editor(&input, "100").take_editor().ok_or("editor")?;
    Ok((p, a))
}
fn run(a: &mut BreditorRichEditor, c: &Value, status: &str) -> Result {
    let actual = a.execute(&a.observe(), &c.to_string());
    if actual.status() != status {
        return Err(format!("Expected {status}, got {} for {c}", actual.status()).into());
    }
    Ok(())
}
fn future(p: &BreditorRichProfile, a: &mut BreditorRichEditor, natural: bool) -> Result {
    let checkpoint = read(a.checkpoint_json())?;
    let mut b =
        if natural { p.restore_typing_editor(&checkpoint) } else { p.restore_editor(&checkpoint) }
            .take_editor()
            .ok_or("restore")?;
    for command in ["undo", "redo", "undo", "redo"] {
        run(a, &json!({"kind":command}), command)?;
        run(&mut b, &json!({"kind":command}), command)?;
        assert_eq!(read(a.checkpoint_json())?, read(b.checkpoint_json())?);
    }
    Ok(())
}
#[test]
fn explicit_plain_and_first_key_commands_keep_real_before_carets_and_recover_exactly() -> Result {
    for natural in [false, true] {
        for backwards in [false, true] {
            let (p, mut a) = setup()?;
            assert_eq!(a.general_range_version(), "1");
            let before = if natural {
                target("p-0-0", "1", "p-0-0", "1")
            } else {
                target("q2", "2", "q2", "2")
            };
            run(&mut a, &json!({"kind":"setSelection","selection":before}), "selection")?;
            run(
                &mut a,
                &json!({"kind":"setPendingFormats","formats":[{"type":"breditor/strong","properties":{}}]}),
                "typing",
            )?;
            if natural {
                read(a.enable_typing_history(&a.observe()))?;
            }
            let source = read(a.observe().document_json())?;
            let selection = if backwards {
                target("p-1-1", "3", "p-0-0", "1")
            } else {
                target("p-0-0", "1", "p-1-1", "3")
            };
            let mut request = json!({"kind":if natural{"replaceGeneralRangeTypingText"}else{"replaceGeneralRangePlainText"},"data":{"selection":selection,"text":"Q🙂","prefix":"native-floor"}});
            if natural {
                request["data"]["clockMs"] = json!("1000");
            }
            run(&mut a, &request, "content")?;
            if natural {
                run(
                    &mut a,
                    &json!({"kind":"insertTypingText","data":{"text":"Y","clockMs":"1050"}}),
                    "content",
                )?;
            }
            run(&mut a, &json!({"kind":"undo"}), "undo")?;
            assert_eq!(read(a.observe().document_json())?, source);
            let view: Value = serde_json::from_str(&read(a.observe().view_json())?)?;
            assert_eq!(view["selection"], before);
            run(&mut a, &json!({"kind":"redo"}), "redo")?;
            future(&p, &mut a, natural)?;
        }
    }
    Ok(())
}
#[test]
fn explicit_rich_runs_work_without_a_current_selection_and_keep_partial_tables() -> Result {
    let (p, mut a) = setup()?;
    let input = json!({"kind":"replaceGeneralRangeText","data":{"selection":target("p-0-0","1","p-1-1","3"),"runs":[{"text":"Q🙂","formatsJson":"[{\"type\":\"breditor/strong\",\"properties\":{}}]"},{"text":"R","formatsJson":"[]"}],"prefix":"rich-floor"}});
    run(&mut a, &input, "content")?;
    assert!(read(a.observe().document_json())?.contains("rich-floor:range:0"));
    future(&p, &mut a, false)?;
    Ok(())
}
#[test]
fn malformed_request_limits_and_stale_tokens_do_not_publish_a_selection_or_content_prefix() -> Result
{
    let (_, mut a) = setup()?;
    let input = json!({"kind":"replaceGeneralRangePlainText","data":{"selection":target("p-0-0","1","p-1-1","3"),"text":"Q","prefix":"floor"}});
    let before = read(a.checkpoint_json())?;
    for change in 0..5 {
        let mut c = input.clone();
        match change {
            0 => c["data"]["extra"] = json!(true),
            1 => c["data"]["prefix"] = json!("x".repeat(91)),
            2 => c["data"]["selection"]["anchor"]["offset"] = json!(1),
            3 => c["data"]["selection"]["anchor"]["offset"] = json!("2"),
            _ => c["data"]["text"] = json!("x".repeat(65537)),
        }
        run(&mut a, &c, "error")?;
        assert_eq!(read(a.checkpoint_json())?, before);
    }
    let stale = a.observe();
    run(
        &mut a,
        &json!({"kind":"setSelection","selection":target("q2","2","q2","2")}),
        "selection",
    )?;
    let before = read(a.checkpoint_json())?;
    assert_eq!(a.execute(&stale, "not json").status(), "error");
    assert_eq!(read(a.checkpoint_json())?, before);
    read(a.set_read_only(&a.observe(), true))?;
    let before = read(a.checkpoint_json())?;
    run(&mut a, &input, "error")?;
    assert_eq!(read(a.checkpoint_json())?, before);
    Ok(())
}

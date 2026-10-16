//! Strict native clipboard payload admission at general targets, without JS format reconstruction.
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
fn setup() -> Result<(BreditorRichProfile, BreditorRichEditor, Value)> {
    let input=json!({"format":"breditor/profile-bootstrap","formatVersion":8,"schema":{"name":"example/general-clipboard-wasm","version":1},"extensions":[]}).to_string();
    let p = BreditorRichProfile::from_standard_layout_bootstrap_json_v3(&input)
        .take_profile()
        .ok_or("profile")?;
    let binding: Value = serde_json::from_str(&read(p.descriptor_json())?)?;
    let input=json!({"format":"breditor/document","formatVersion":2,"schema":binding["schema"],"schemaFingerprint":binding["schemaFingerprint"],"root":fixture::root()}).to_string();
    let a = p.create_editor(&input, "100").take_editor().ok_or("editor")?;
    Ok((p, a, binding))
}
fn clipboard(binding: &Value) -> Value {
    json!({"format":"breditor/rich-clipboard","formatVersion":1,"kind":"text","document":{"format":"breditor/document","formatVersion":2,"schema":binding["schema"],"schemaFingerprint":binding["schemaFingerprint"],"root":{"kind":"element","type":"breditor/document","entityId":null,"properties":{"breditor/document-id":"breditor-clipboard"},"children":[{"kind":"element","type":"breditor/paragraph","entityId":null,"properties":{"breditor/block-id":"clipboard-text"},"children":[{"kind":"text","text":"Q🙂","formats":[{"type":"breditor/strong","properties":{}}]}]}]}}})
}
#[test]
fn general_flow_paste_preserves_partial_structure_and_exact_existing_history() -> Result {
    for natural in [false, true] {
        for backward in [false, true] {
            for (first, x, last, y) in [
                ("p-0-0", "1", "p-1-1", "3"),
                ("nested-text", "1", "code", "2"),
                ("z-intro", "1", "code", "2"),
                ("q1", "2", "q1", "2"),
            ] {
                let (p, mut a, _binding) = setup()?;
                assert_eq!(a.general_flow_paste_version(), "1");
                run(
                    &mut a,
                    &json!({"kind":"setSelection","selection":{"kind":"node","block":"image"}}),
                    "selection",
                )?;
                let transfer: Value =
                    serde_json::from_str(&read(a.observe().general_clipboard_json())?)?;
                let clip = transfer["structuredJson"].as_str().ok_or("flow")?;
                let before = target("q2", "1", "q2", "1");
                run(&mut a, &json!({"kind":"setSelection","selection":before}), "selection")?;
                let pending = json!([{"type":"breditor-inline/italic","properties":{}}]);
                run(&mut a, &json!({"kind":"setPendingFormats","formats":pending}), "typing")?;
                if natural {
                    read(a.enable_typing_history(&a.observe()))?;
                }
                let source = read(a.observe().document_json())?;
                let before_view: Value = serde_json::from_str(&read(a.observe().view_json())?)?;
                let selection =
                    if backward { target(last, y, first, x) } else { target(first, x, last, y) };
                let command = json!({"kind":"pasteGeneralFlowClipboard","data":{"selection":selection,"clipboardJson":clip,"allocation":{"prefix":"flow-paste","replica":"1","counter":"1","lamport":"1"},"prefix":"flow-paste","right":"flow-right"}});
                run(&mut a, &command, "content")?;
                let after = read(a.observe().document_json())?;
                assert_ne!(after, source);
                assert!(after.contains("flow-paste:i:"));
                let v: Value = serde_json::from_str(&read(a.observe().view_json())?)?;
                assert_eq!(v["undoDepth"], 1);
                let saved = read(a.checkpoint_json())?;
                let mut b = if natural {
                    p.restore_typing_editor(&saved)
                } else {
                    p.restore_editor(&saved)
                }
                .take_editor()
                .ok_or("restore flow")?;
                for kind in ["undo", "redo", "undo", "redo"] {
                    run(&mut a, &json!({"kind":kind}), kind)?;
                    run(&mut b, &json!({"kind":kind}), kind)?;
                    assert_eq!(read(a.checkpoint_json())?, read(b.checkpoint_json())?);
                    if kind == "undo" {
                        assert_eq!(read(a.observe().document_json())?, source);
                        let v: Value = serde_json::from_str(&read(a.observe().view_json())?)?;
                        assert_eq!(v["selection"], before);
                        assert_eq!(v["pendingFormatsJson"], before_view["pendingFormatsJson"]);
                    } else {
                        assert_eq!(read(a.observe().document_json())?, after);
                    }
                }
            }
        }
    }
    Ok(())
}
#[test]
fn general_copy_is_frozen_pure_read_with_shape_and_no_unselected_cell_assets() -> Result {
    let (_p, mut a, _binding) = setup()?;
    assert_eq!(a.general_copy_version(), "1");
    run(
        &mut a,
        &json!({"kind":"setSelection","selection":target("p-0-0","1","p-1-1","3")}),
        "selection",
    )?;
    let frozen = a.observe();
    let exact = read(a.checkpoint_json())?;
    assert!(frozen.clipboard_json().take_value().is_none());
    let value = read(frozen.general_clipboard_json())?;
    let transfer: Value = serde_json::from_str(&value)?;
    let clip: Value = serde_json::from_str(transfer["structuredJson"].as_str().ok_or("clip")?)?;
    assert_eq!(clip["formatVersion"], 1);
    assert_eq!(
        clip["document"]["root"]["children"][0]["children"].as_array().ok_or("rows")?.len(),
        3
    );
    assert!(!value.contains("Diagram"));
    assert_eq!(read(a.checkpoint_json())?, exact);
    run(
        &mut a,
        &json!({"kind":"replaceGeneralRangePlainText","data":{"selection":target("q1","0","q1","1"),"text":"X","prefix":"copy-later"}}),
        "content",
    )?;
    assert_eq!(read(frozen.general_clipboard_json())?, value);
    run(
        &mut a,
        &json!({"kind":"setSelection","selection":target("p-0-0","1","p-1-1","3")}),
        "selection",
    )?;
    read(a.set_read_only(&a.observe(), true))?;
    assert_eq!(read(a.observe().general_clipboard_json())?, value);
    Ok(())
}
fn run(a: &mut BreditorRichEditor, command: &Value, expected: &str) -> Result {
    let r = a.execute(&a.observe(), &command.to_string());
    assert_eq!(r.status(), expected);
    Ok(())
}
#[test]
fn clipboard_paste_keeps_real_before_ui_and_exact_existing_local_replay_families() -> Result {
    for natural in [false, true] {
        for backwards in [false, true] {
            let (p, mut a, binding) = setup()?;
            assert_eq!(a.general_inline_paste_version(), "1");
            let before = target("q2", "2", "q2", "2");
            run(&mut a, &json!({"kind":"setSelection","selection":before}), "selection")?;
            run(
                &mut a,
                &json!({"kind":"setPendingFormats","formats":[{"type":"breditor-inline/italic","properties":{}}]}),
                "typing",
            )?;
            if natural {
                read(a.enable_typing_history(&a.observe()))?;
            }
            let source = read(a.observe().document_json())?;
            let selection = if backwards {
                target("code", "1", "z-intro", "1")
            } else {
                target("z-intro", "1", "code", "1")
            };
            run(
                &mut a,
                &json!({"kind":"pasteGeneralInlineClipboard","data":{"selection":selection,"clipboardJson":clipboard(&binding).to_string(),"prefix":"clipboard-floor"}}),
                "content",
            )?;
            let after = read(a.observe().document_json())?;
            assert!(after.contains("Q🙂"));
            assert!(after.contains("breditor/strong"));
            let saved = read(a.checkpoint_json())?;
            let mut b =
                if natural { p.restore_typing_editor(&saved) } else { p.restore_editor(&saved) }
                    .take_editor()
                    .ok_or("restore")?;
            for kind in ["undo", "redo", "undo", "redo"] {
                run(&mut a, &json!({"kind":kind}), kind)?;
                run(&mut b, &json!({"kind":kind}), kind)?;
                assert!(read(a.checkpoint_json())? == read(b.checkpoint_json())?);
                if kind == "undo" {
                    assert_eq!(read(a.observe().document_json())?, source);
                    let v: Value = serde_json::from_str(&read(a.observe().view_json())?)?;
                    assert_eq!(v["selection"], before);
                } else {
                    assert_eq!(read(a.observe().document_json())?, after);
                }
            }
        }
    }
    Ok(())
}
#[test]
fn strict_outer_and_embedded_payloads_refuse_without_consuming_the_current_observation() -> Result {
    let (_p, mut a, binding) = setup()?;
    let clip = clipboard(&binding);
    let request = json!({"kind":"pasteGeneralInlineClipboard","data":{"selection":target("p-0-0","1","p-1-1","3"),"clipboardJson":clip.to_string(),"prefix":"clipboard-floor"}});
    let exact = read(a.checkpoint_json())?;
    for clipboard in [
        "".to_owned(),
        "{".into(),
        clip.to_string().replacen("\"kind\":\"text\"", "\"kind\":\"text\",\"unknown\":true", 1),
        clip.to_string().replacen(
            "\"formatVersion\":1",
            "\"formatVersion\":1,\"formatVersion\":1",
            1,
        ),
    ] {
        let mut bad = request.clone();
        bad["data"]["clipboardJson"] = json!(clipboard);
        run(&mut a, &bad, "error")?;
        assert!(read(a.checkpoint_json())? == exact);
    }
    for (field, value) in [
        ("unknown", json!(true)),
        ("clipboardJson", json!({})),
        ("selection", target("missing", "0", "missing", "0")),
        ("prefix", json!("x".repeat(91))),
    ] {
        let mut bad = request.clone();
        bad["data"][field] = value;
        run(&mut a, &bad, "error")?;
        assert!(read(a.checkpoint_json())? == exact);
    }
    let observation = a.observe();
    let duplicate = format!(
        "{{\"kind\":\"pasteGeneralInlineClipboard\",\"data\":{},\"data\":{}}}",
        request["data"], request["data"]
    );
    assert_eq!(a.execute(&observation, &duplicate).status(), "error");
    assert!(read(a.checkpoint_json())? == exact);
    run(&mut a, &request, "content")?;
    assert_eq!(a.execute(&observation, "bad").status(), "error");
    Ok(())
}
#[test]
fn read_only_and_wrong_kind_or_code_rejection_never_fall_back_to_plain_text() -> Result {
    let (_p, mut a, binding) = setup()?;
    let mut clip = clipboard(&binding);
    let request = json!({"kind":"pasteGeneralInlineClipboard","data":{"selection":target("code","1","code","2"),"clipboardJson":clip.to_string(),"prefix":"clipboard-floor"}});
    let exact = read(a.checkpoint_json())?;
    run(&mut a, &request, "error")?;
    assert!(read(a.checkpoint_json())? == exact);
    clip["kind"] = json!("flow");
    let mut wrong = request.clone();
    wrong["data"]["clipboardJson"] = json!(clip.to_string());
    run(&mut a, &wrong, "error")?;
    assert!(read(a.checkpoint_json())? == exact);
    read(a.set_read_only(&a.observe(), true))?;
    let exact = read(a.checkpoint_json())?;
    run(&mut a, &json!({"kind":"pasteGeneralInlineClipboard","data":"malformed"}), "error")?;
    assert!(read(a.checkpoint_json())? == exact);
    Ok(())
}

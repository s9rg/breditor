//! Separate guarded document-scope APIs do not reinterpret original commands or checkpoint families.
#![cfg(feature = "experimental-rich-content")]
#[path = "../../breditor-core/tests/support/coverage_fixture.rs"]
mod fixture;
use breditor_wasm::{BreditorRichEditor, BreditorRichProfile, BreditorStringResult};
use serde_json::{Value, json};
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;
fn read(mut r: BreditorStringResult) -> Result<String> {
    r.take_value().ok_or("native read".into())
}
fn view(a: &BreditorRichEditor) -> Result<Value> {
    Ok(serde_json::from_str(&read(a.observe().document_view_json())?)?)
}
fn setup(hidden_only: bool) -> Result<(BreditorRichProfile, BreditorRichEditor)> {
    let p=BreditorRichProfile::from_standard_layout_bootstrap_json_v3(&json!({"format":"breditor/profile-bootstrap","formatVersion":8,"schema":{"name":"example/document-wasm","version":1},"extensions":[]}).to_string()).take_profile().ok_or("profile")?;
    let binding: Value = serde_json::from_str(&read(p.descriptor_json())?)?;
    let mut root = fixture::root();
    if hidden_only {
        root["children"]
            .as_array_mut()
            .ok_or("children")?
            .retain(|n| n["properties"]["breditor/block-id"] == "hidden");
    }
    let input=json!({"format":"breditor/document","formatVersion":2,"schema":binding["schema"],"schemaFingerprint":binding["schemaFingerprint"],"root":root}).to_string();
    let a = p.create_editor(&input, "100").take_editor().ok_or("owner")?;
    Ok((p, a))
}
#[test]
fn rich_document_paste_is_closed_guarded_and_retains_exact_native_future_history() -> Result {
    for natural in [false, true] {
        for hidden in [false, true] {
            let (p, mut a) = setup(hidden)?;
            let (_, mut donor) = setup(false)?;
            assert_eq!(a.document_clipboard_version(), "1");
            assert_eq!(donor.select_document(&donor.observe()).status(), "selection");
            let transfer: Value =
                serde_json::from_str(&read(donor.observe().general_clipboard_json())?)?;
            let clipboard = transfer["structuredJson"].as_str().ok_or("clipboard")?;
            if natural {
                read(a.enable_typing_history(&a.observe()))?;
            }
            let stale = a.observe();
            assert_eq!(a.select_document(&a.observe()).status(), "selection");
            let source = read(a.observe().document_json())?;
            let selected = read(a.document_checkpoint_json())?;
            for bad in [
                "bad".into(),
                json!({"clipboardJson":clipboard,"prefix":"fresh","extra":true}).to_string(),
                "{\"clipboardJson\":\"x\",\"prefix\":\"a\",\"prefix\":\"b\"}".into(),
                json!({"clipboardJson":"bad","prefix":"fresh"}).to_string(),
                json!({"clipboardJson":clipboard,"prefix":""}).to_string(),
            ] {
                assert_eq!(a.paste_document_clipboard(&a.observe(), &bad).status(), "error");
                assert_eq!(read(a.document_checkpoint_json())?, selected);
            }
            assert_eq!(a.paste_document_clipboard(&stale, "bad").status(), "error");
            assert_eq!(a.paste_document_clipboard(&donor.observe(), "bad").status(), "error");
            let input = json!({"clipboardJson":clipboard,"prefix":"whole-rich"}).to_string();
            assert_eq!(a.paste_document_clipboard(&a.observe(), &input).status(), "content");
            assert_eq!(view(&a)?["undoDepth"], 1);
            let exact = read(a.document_checkpoint_json())?;
            let mut b = if natural {
                p.restore_document_typing_editor(&exact)
            } else {
                p.restore_document_editor(&exact)
            }
            .take_editor()
            .ok_or("rich restore")?;
            assert_eq!(read(b.document_checkpoint_json())?, exact);
            for command in ["undo", "redo", "undo", "redo"] {
                assert_eq!(
                    a.execute(&a.observe(), &json!({"kind":command}).to_string()).status(),
                    command
                );
                assert_eq!(
                    b.execute(&b.observe(), &json!({"kind":command}).to_string()).status(),
                    command
                );
                assert_eq!(
                    read(a.document_checkpoint_json())?,
                    read(b.document_checkpoint_json())?
                );
                if command == "undo" {
                    assert_eq!(read(a.observe().document_json())?, source);
                    assert_eq!(view(&a)?["selection"], json!({"kind":"document"}));
                }
            }
            read(a.set_read_only(&a.observe(), true))?;
            let exact = read(a.document_checkpoint_json())?;
            assert_eq!(a.paste_document_clipboard(&a.observe(), &input).status(), "error");
            assert_eq!(read(a.document_checkpoint_json())?, exact);
        }
    }
    Ok(())
}
#[test]
fn explicit_document_scope_and_replace_restore_exact_future_histories() -> Result {
    for natural in [false, true] {
        for hidden_only in [false, true] {
            for text in ["", "Q🙂"] {
                let (p, mut a) = setup(hidden_only)?;
                assert_eq!(p.document_selection_version(), "1");
                assert_eq!(a.document_selection_version(), "1");
                if natural {
                    read(a.enable_typing_history(&a.observe()))?;
                }
                assert_eq!(a.select_document(&a.observe()).status(), "selection");
                assert_eq!(view(&a)?["selection"], json!({"kind":"document"}));
                assert_eq!(view(&a)?["format"], "breditor/rich-document-view");
                assert!(a.observe().view_json().take_value().is_none());
                assert_eq!(view(&a)?["undoDepth"], 0);
                let source = read(a.observe().document_json())?;
                let selected = read(a.document_checkpoint_json())?;
                assert!(a.checkpoint_json().take_value().is_none());
                assert!(p.restore_editor(&selected).take_editor().is_none());
                assert!(p.restore_typing_editor(&selected).take_editor().is_none());
                let transfer: Value =
                    serde_json::from_str(&read(a.observe().general_clipboard_json())?)?;
                assert_eq!(transfer["kind"], "flow");
                assert_eq!(
                    a.replace_document_plain_text(
                        &a.observe(),
                        &json!({"paragraph":"replacement","text":text}).to_string()
                    )
                    .status(),
                    "content"
                );
                assert_eq!(view(&a)?["undoDepth"], 1);
                assert!(a.checkpoint_json().take_value().is_none());
                let bytes = read(a.document_checkpoint_json())?;
                let mut recovered = if natural {
                    p.restore_document_typing_editor(&bytes)
                } else {
                    p.restore_document_editor(&bytes)
                }
                .take_editor()
                .ok_or("restore")?;
                assert_eq!(read(recovered.document_checkpoint_json())?, bytes);
                for command in ["undo", "redo", "undo", "redo"] {
                    assert_eq!(
                        a.execute(&a.observe(), &json!({"kind":command}).to_string()).status(),
                        command
                    );
                    assert_eq!(
                        recovered
                            .execute(&recovered.observe(), &json!({"kind":command}).to_string())
                            .status(),
                        command
                    );
                    assert_eq!(
                        read(a.document_checkpoint_json())?,
                        read(recovered.document_checkpoint_json())?
                    );
                    if command == "undo" {
                        assert_eq!(view(&a)?["selection"], json!({"kind":"document"}));
                        assert_eq!(read(a.observe().document_json())?, source);
                    }
                }
            }
        }
    }
    Ok(())
}
#[test]
fn closed_original_selection_dto_guards_and_new_recovery_choice_remain_explicit() -> Result {
    let (p, mut a) = setup(false)?;
    let (_, foreign) = setup(false)?;
    let original = read(a.checkpoint_json())?;
    assert!(p.restore_document_editor(&original).take_editor().is_none());
    let observation = a.observe();
    assert_eq!(
        a.execute(
            &observation,
            &json!({"kind":"setSelection","selection":{"kind":"document"}}).to_string()
        )
        .status(),
        "error"
    );
    assert_eq!(read(a.checkpoint_json())?, original);
    assert_eq!(a.select_document(&foreign.observe()).status(), "error");
    assert_eq!(a.select_document(&observation).status(), "selection");
    assert_eq!(a.replace_document_plain_text(&observation, "bad").status(), "error");
    let exact = read(a.document_checkpoint_json())?;
    for input in [
        "bad".to_owned(),
        json!({"paragraph":"fresh","text":"X","extra":true}).to_string(),
        "{\"paragraph\":\"fresh\",\"text\":\"X\",\"text\":\"Y\"}".to_owned(),
        json!({"paragraph":"q1","text":"X"}).to_string(),
    ] {
        assert_eq!(a.replace_document_plain_text(&a.observe(), &input).status(), "error");
        assert_eq!(read(a.document_checkpoint_json())?, exact);
    }
    read(a.set_read_only(&a.observe(), true))?;
    let exact = read(a.document_checkpoint_json())?;
    assert_eq!(a.replace_document_plain_text(&a.observe(), "bad").status(), "error");
    assert_eq!(read(a.document_checkpoint_json())?, exact);
    assert_eq!(a.select_document(&a.observe()).status(), "unchanged");
    assert!(p.restore_document_typing_editor(&exact).take_editor().is_none());
    Ok(())
}

#[test]
fn first_key_document_typing_has_closed_clock_and_exact_grouped_recovery() -> Result {
    let (p, mut a) = setup(false)?;
    assert_eq!(a.document_typing_version(), "1");
    read(a.enable_typing_history(&a.observe()))?;
    assert_eq!(a.select_document(&a.observe()).status(), "selection");
    let before = read(a.observe().document_json())?;
    let exact = read(a.document_checkpoint_json())?;
    for clock in [json!(1), json!("01"), json!("+1"), json!("18446744073709551616")] {
        assert_eq!(
            a.replace_document_typing_text(
                &a.observe(),
                &json!({"paragraph":"whole","text":"Q","clockMs":clock}).to_string()
            )
            .status(),
            "error"
        );
        assert_eq!(read(a.document_checkpoint_json())?, exact);
    }
    assert_eq!(
        a.replace_document_typing_text(
            &a.observe(),
            &json!({"paragraph":"whole","text":"","clockMs":"1"}).to_string()
        )
        .status(),
        "unchanged"
    );
    assert_eq!(read(a.document_checkpoint_json())?, exact);
    assert_eq!(
        a.replace_document_typing_text(
            &a.observe(),
            &json!({"paragraph":"whole","text":"Q","clockMs":"1"}).to_string()
        )
        .status(),
        "content"
    );
    for (text, clock) in [("🙂", "2"), ("R", "3")] {
        assert_eq!(
            a.execute(
                &a.observe(),
                &json!({"kind":"insertTypingText","data":{"text":text,"clockMs":clock}})
                    .to_string()
            )
            .status(),
            "content"
        );
    }
    assert_eq!(view(&a)?["undoDepth"], 1);
    let bytes = read(a.document_checkpoint_json())?;
    let mut b = p.restore_document_typing_editor(&bytes).take_editor().ok_or("typing restore")?;
    assert_eq!(read(b.document_checkpoint_json())?, bytes);
    for command in ["undo", "redo", "undo", "redo"] {
        assert_eq!(a.execute(&a.observe(), &json!({"kind":command}).to_string()).status(), command);
        assert_eq!(b.execute(&b.observe(), &json!({"kind":command}).to_string()).status(), command);
        assert_eq!(read(a.document_checkpoint_json())?, read(b.document_checkpoint_json())?);
        if command == "undo" {
            assert_eq!(view(&a)?["selection"], json!({"kind":"document"}));
            assert_eq!(read(a.observe().document_json())?, before);
        }
    }
    Ok(())
}

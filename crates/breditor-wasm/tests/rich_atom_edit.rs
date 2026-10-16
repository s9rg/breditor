//! Optional closed atom commands retain guards, original actions and exact native grouping.
#![cfg(feature = "experimental-rich-content")]
use breditor_wasm::{BreditorRichEditor, BreditorRichProfile, BreditorStringResult};
use serde_json::{Value, json};
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;
fn read(mut r: BreditorStringResult) -> Result<String> {
    r.take_value().ok_or("value".into())
}
fn setup() -> Result<(BreditorRichProfile, BreditorRichEditor)> {
    let bootstrap=json!({"format":"breditor/profile-bootstrap","formatVersion":7,"schema":{"name":"example/atom-wasm","version":1},"extensions":[]}).to_string();
    let p = BreditorRichProfile::from_structural_bootstrap_json_v2(&bootstrap)
        .take_profile()
        .ok_or("profile")?;
    let binding: Value = serde_json::from_str(&read(p.descriptor_json())?)?;
    let root: Value = serde_json::from_str(include_str!(
        "../../breditor-core/tests/fixtures/rich-local-root.json"
    ))?;
    let input=json!({"format":"breditor/document","formatVersion":2,"schema":binding["schema"],"schemaFingerprint":binding["schemaFingerprint"],"root":root}).to_string();
    let a = p.create_editor(&input, "100").take_editor().ok_or("editor")?;
    Ok((p, a))
}
fn run(a: &mut BreditorRichEditor, c: &Value, status: &str) -> Result {
    let actual = a.execute(&a.observe(), &c.to_string());
    if actual.status() != status {
        return Err(format!("expected {status}, got {}", actual.status()).into());
    }
    Ok(())
}
fn select(a: &mut BreditorRichEditor, block: &str) -> Result {
    run(a, &json!({"kind":"setSelection","selection":{"kind":"node","block":block}}), "selection")
}
fn saved(a: &BreditorRichEditor) -> Result<String> {
    read(a.checkpoint_json())
}
#[test]
fn native_atom_commands_keep_original_history_and_typing_partition_after_restore() -> Result {
    for natural in [false, true] {
        let (p, mut a) = setup()?;
        assert_eq!(a.atom_edit_version(), "1");
        if natural {
            read(a.enable_typing_history(&a.observe()))?;
        }
        select(&mut a, "table-block")?;
        let before = read(a.observe().document_json())?;
        run(
            &mut a,
            &json!({"kind":"deleteAtom","data":{"paragraph":"floor","movement":"after"}}),
            "content",
        )?;
        run(&mut a, &json!({"kind":"undo"}), "undo")?;
        assert_eq!(read(a.observe().document_json())?, before);
        run(
            &mut a,
            &json!({"kind":"replaceAtomPlainText","data":{"paragraph":"plain","text":""}}),
            "content",
        )?;
        run(&mut a, &json!({"kind":"undo"}), "undo")?;
        assert_eq!(read(a.observe().document_json())?, before);
        if natural {
            run(
                &mut a,
                &json!({"kind":"replaceAtomTypingText","data":{"paragraph":"typed","text":"Q","clockMs":"100"}}),
                "content",
            )?;
            run(
                &mut a,
                &json!({"kind":"insertTypingText","data":{"text":"🙂","clockMs":"200"}}),
                "content",
            )?;
        } else {
            run(
                &mut a,
                &json!({"kind":"replaceAtomPlainText","data":{"paragraph":"typed","text":"Q🙂"}}),
                "content",
            )?;
        }
        let mut b = if natural {
            p.restore_typing_editor(&saved(&a)?)
        } else {
            p.restore_editor(&saved(&a)?)
        }
        .take_editor()
        .ok_or("restore")?;
        for kind in ["undo", "redo", "undo", "redo"] {
            run(&mut a, &json!({"kind":kind}), kind)?;
            run(&mut b, &json!({"kind":kind}), kind)?;
            assert_eq!(saved(&a)?, saved(&b)?);
            if kind == "undo" {
                assert_eq!(read(a.observe().document_json())?, before);
            }
        }
    }
    Ok(())
}
#[test]
fn malformed_commands_extra_fields_invalid_clocks_and_policy_fail_without_publication() -> Result {
    let (_, mut a) = setup()?;
    select(&mut a, "table-block")?;
    read(a.enable_typing_history(&a.observe()))?;
    for c in [
        json!({"kind":"deleteAtom","data":{"paragraph":"floor","movement":"left"}}),
        json!({"kind":"deleteAtom","data":{"paragraph":"floor","movement":"after","extra":1}}),
        json!({"kind":"replaceAtomPlainText","data":{"paragraph":"new","text":"Q","extra":1}}),
        json!({"kind":"replaceAtomTypingText","data":{"paragraph":"new","text":"Q","clockMs":100}}),
        json!({"kind":"replaceAtomTypingText","data":{"paragraph":"new","text":"Q","clockMs":"01"}}),
        json!({"kind":"replaceAtomPlainText","data":{"paragraph":"table-block","text":"Q"}}),
    ] {
        let before = saved(&a)?;
        run(&mut a, &c, "error")?;
        assert_eq!(saved(&a)?, before);
    }
    let stale = a.observe();
    read(a.set_read_only(&a.observe(), true))?;
    let before = saved(&a)?;
    assert_eq!(a.execute(&stale, "not JSON").status(), "error");
    for c in [
        json!({"kind":"deleteAtom","data":{"paragraph":"new","movement":"after"}}),
        json!({"kind":"replaceAtomPlainText","data":{"paragraph":"new","text":"Q"}}),
        json!({"kind":"replaceAtomTypingText","data":{"paragraph":"new","text":"Q","clockMs":"1"}}),
    ] {
        run(&mut a, &c, "error")?;
        assert_eq!(saved(&a)?, before);
    }
    Ok(())
}

//! General Enter trims protected coverage and chooses native paragraph/list/task boundaries atomically.
#![cfg(feature = "experimental-rich-content")]
#[path = "../../breditor-core/tests/support/coverage_fixture.rs"]
mod fixture;
use breditor_wasm::{BreditorRichEditor, BreditorRichProfile, BreditorStringResult};
use serde_json::{Value, json};
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;
fn read(mut result: BreditorStringResult) -> Result<String> {
    result.take_value().ok_or("native value".into())
}
fn range(a: &str, x: &str, b: &str, y: &str) -> Value {
    json!({"kind":"text","anchor":{"block":a,"offset":x,"affinity":"after"},"focus":{"block":b,"offset":y,"affinity":"after"}})
}
fn run(a: &mut BreditorRichEditor, command: Value, status: &str) {
    assert_eq!(a.execute(&a.observe(), &command.to_string()).status(), status);
}
fn setup() -> Result<(BreditorRichProfile, BreditorRichEditor)> {
    let p=BreditorRichProfile::from_standard_layout_bootstrap_json_v3(&json!({"format":"breditor/profile-bootstrap","formatVersion":8,"schema":{"name":"example/general-paragraph","version":1},"extensions":[]}).to_string()).take_profile().ok_or("profile")?;
    let binding: Value = serde_json::from_str(&read(p.descriptor_json())?)?;
    let input=json!({"format":"breditor/document","formatVersion":2,"schema":binding["schema"],"schemaFingerprint":binding["schemaFingerprint"],"root":fixture::root()}).to_string();
    let a = p.create_editor(&input, "100").take_editor().ok_or("owner")?;
    Ok((p, a))
}
fn find<'a>(root: &'a Value, id: &str) -> Option<&'a Value> {
    let mut todo = vec![root];
    while let Some(n) = todo.pop() {
        if n["properties"]["breditor/block-id"] == id {
            return Some(n);
        }
        if let Some(children) = n["children"].as_array() {
            todo.extend(children);
        }
    }
    None
}
#[test]
fn native_enter_keeps_real_before_ui_and_both_exact_recovery_families() -> Result {
    for natural in [false, true] {
        for backward in [false, true] {
            for (first, last, item_kind) in [
                ("p-0-0", "p-1-1", None),
                ("z-intro", "code", None),
                ("nested-text", "task-head", Some("breditor/list-item")),
                ("task-head", "code", Some("breditor/task-item")),
            ] {
                let (p, mut a) = setup()?;
                assert_eq!(a.general_paragraph_version(), "1");
                let actual = range("q2", "1", "q2", "1");
                run(&mut a, json!({"kind":"setSelection","selection":actual}), "selection");
                run(
                    &mut a,
                    json!({"kind":"setPendingFormats","formats":[{"type":"breditor-inline/italic","properties":{}}]}),
                    "typing",
                );
                if natural {
                    read(a.enable_typing_history(&a.observe()))?;
                }
                let before = read(a.observe().document_json())?;
                let before_ui: Value = serde_json::from_str(&read(a.observe().view_json())?)?;
                let target = if backward {
                    range(last, "1", first, "1")
                } else {
                    range(first, "1", last, "1")
                };
                run(
                    &mut a,
                    json!({"kind":"insertGeneralParagraph","data":{"selection":target,"prefix":"enter"}}),
                    "content",
                );
                let after = read(a.observe().document_json())?;
                let parsed: Value = serde_json::from_str(&after)?;
                assert!(find(&parsed["root"], "enter:paragraph").is_some());
                if let Some(kind) = item_kind {
                    let item = find(&parsed["root"], "enter:item").ok_or("native item")?;
                    assert_eq!(item["type"], kind);
                    if kind == "breditor/task-item" {
                        assert_eq!(item["properties"]["breditor/checked"], false);
                        assert_eq!(
                            find(&parsed["root"], "task").ok_or("left task")?["properties"]["breditor/checked"],
                            true
                        );
                    }
                }
                let view: Value = serde_json::from_str(&read(a.observe().view_json())?)?;
                assert_eq!(view["undoDepth"], 1);
                assert_eq!(
                    view["selection"],
                    range("enter:paragraph", "0", "enter:paragraph", "0")
                );
                let saved = read(a.checkpoint_json())?;
                let mut b = if natural {
                    p.restore_typing_editor(&saved)
                } else {
                    p.restore_editor(&saved)
                }
                .take_editor()
                .ok_or("restore")?;
                for command in ["undo", "redo", "undo", "redo"] {
                    run(&mut a, json!({"kind":command}), command);
                    run(&mut b, json!({"kind":command}), command);
                    assert_eq!(read(a.checkpoint_json())?, read(b.checkpoint_json())?);
                    if command == "undo" {
                        assert_eq!(read(a.observe().document_json())?, before);
                        let ui: Value = serde_json::from_str(&read(a.observe().view_json())?)?;
                        assert_eq!(ui["selection"], actual);
                        assert_eq!(ui["pendingFormatsJson"], before_ui["pendingFormatsJson"]);
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
fn paragraph_separates_typing_groups_on_both_sides_without_a_controller_boundary() -> Result {
    let (p, mut a) = setup()?;
    run(&mut a, json!({"kind":"setSelection","selection":range("q2","1","q2","1")}), "selection");
    read(a.enable_typing_history(&a.observe()))?;
    run(&mut a, json!({"kind":"insertTypingText","data":{"text":"P","clockMs":"1"}}), "content");
    let before = read(a.observe().document_json())?;
    run(
        &mut a,
        json!({"kind":"insertGeneralParagraph","data":{"selection":range("z-intro","1","code","1"),"prefix":"enter"}}),
        "content",
    );
    let paragraph = read(a.observe().document_json())?;
    for (text, clock) in [("Y", "10"), ("Z", "11")] {
        run(
            &mut a,
            json!({"kind":"insertTypingText","data":{"text":text,"clockMs":clock}}),
            "content",
        );
    }
    let ui: Value = serde_json::from_str(&read(a.observe().view_json())?)?;
    assert_eq!(ui["undoDepth"], 3);
    let exact = read(a.checkpoint_json())?;
    let mut b =
        p.restore_typing_editor(&exact).take_editor().ok_or("restore typing around Enter")?;
    for expected in [&paragraph, &before] {
        run(&mut a, json!({"kind":"undo"}), "undo");
        run(&mut b, json!({"kind":"undo"}), "undo");
        assert_eq!(read(a.observe().document_json())?, *expected);
        assert_eq!(read(a.checkpoint_json())?, read(b.checkpoint_json())?);
    }
    Ok(())
}
#[test]
fn invalid_sources_reused_ids_unknown_fields_and_guards_leave_state_exact() -> Result {
    let (_p, mut a) = setup()?;
    let exact = read(a.checkpoint_json())?;
    for data in [
        json!({"selection":range("caption","1","q1","1"),"prefix":"enter"}),
        json!({"selection":range("code","1","code","2"),"prefix":"enter"}),
        json!({"selection":range("missing","0","q1","1"),"prefix":"enter"}),
        json!({"selection":range("q1","1","q2","1"),"prefix":"x".repeat(91)}),
        json!({"selection":range("q1","1","q2","1"),"prefix":"enter","newItem":"forged"}),
    ] {
        run(&mut a, json!({"kind":"insertGeneralParagraph","data":data}), "error");
        assert_eq!(read(a.checkpoint_json())?, exact);
    }
    let stale = a.observe();
    run(
        &mut a,
        json!({"kind":"insertGeneralParagraph","data":{"selection":range("q1","1","q2","1"),"prefix":"enter"}}),
        "content",
    );
    let exact = read(a.checkpoint_json())?;
    assert_eq!(a.execute(&stale, "bad").status(), "error");
    run(
        &mut a,
        json!({"kind":"insertGeneralParagraph","data":{"selection":range("q1","1","enter:paragraph","0"),"prefix":"enter"}}),
        "error",
    );
    assert_eq!(read(a.checkpoint_json())?, exact);
    read(a.set_read_only(&a.observe(), true))?;
    let exact = read(a.checkpoint_json())?;
    run(&mut a, json!({"kind":"insertGeneralParagraph","data":null}), "error");
    assert_eq!(read(a.checkpoint_json())?, exact);
    Ok(())
}

//! Atomic general flow paste keeps structure, causal suffixes, real before-UI and exact recovery.
#[path = "../../breditor-core/tests/support/coverage_fixture.rs"]
mod fixture;
use breditor_collaboration::{
    anchor::Affinity,
    rich_replica::{
        Command, RichReplica, SharedRichProfile,
        actions::InsertText,
        selection::{Selection, TextPoint},
    },
};
use serde_json::{Value, json};
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;
fn range(a: &str, x: u32, b: &str, y: u32) -> Selection {
    let p = |id: &str, offset| TextPoint { block: id.into(), offset, affinity: Affinity::After };
    Selection::TextRange { anchor: p(a, x), focus: p(b, y) }
}
fn setup() -> Result<(SharedRichProfile, RichReplica)> {
    let p=SharedRichProfile::from_standard_configuration_json_v3(&json!({"format":"breditor/shared-rich-profile","formatVersion":3,"schema":{"name":"example/general-flow","version":1},"extensions":[]}).to_string())?;
    let input=json!({"format":"breditor/document","formatVersion":2,"schema":{"name":"example/general-flow","version":1},"schemaFingerprint":p.schema().fingerprint().to_string(),"root":fixture::root()}).to_string();
    let a = p.create(&input, "101".into())?;
    Ok((p, a))
}
fn saved(a: &RichReplica) -> Result<String> {
    Ok(if a.typing_history_enabled() {
        a.general_typing_checkpoint()?
    } else {
        a.general_checkpoint()?
    })
}
fn restore(p: &SharedRichProfile, a: &RichReplica, s: &str) -> Result<RichReplica> {
    Ok(if a.typing_history_enabled() {
        p.restore_general_typing("room", s)?
    } else {
        p.restore_general("room", s)?
    })
}
fn clipboard(a: &mut RichReplica, block: &str) -> Result<String> {
    a.set_selection(Some(&Selection::Node { block: block.into() }))?;
    Ok(a.copy_general_clipboard_guarded(&a.observe()?)?.ok_or("clipboard")?.rich_json)
}
#[test]
fn flow_paste_is_one_exact_history_unit_across_cells_nested_lists_tasks_and_deleted_actual_caret()
-> Result {
    for natural in [false, true] {
        for backward in [false, true] {
            for (first, x, last, y) in [
                ("p-0-0", 1, "p-1-1", 3),
                ("nested-text", 1, "code", 2),
                ("z-intro", 1, "code", 2),
                ("q1", 1, "task-head", 2),
            ] {
                let (p, mut a) = setup()?;
                a.enable_general_ranges_guarded(&a.observe()?)?;
                if natural {
                    a.enable_typing_history_guarded(&a.observe()?)?;
                }
                let clip = clipboard(&mut a, "image")?;
                let before = range("q2", 1, "q2", 1);
                a.set_selection(Some(&before))?;
                let pending = vec![json!({"type":"breditor-inline/italic","properties":{}})];
                a.set_pending_formats(Some(&pending))?;
                let source = a.document_json().to_owned();
                let before_view: Value = serde_json::from_str(&a.view_json()?)?;
                let target =
                    if backward { range(last, y, first, x) } else { range(first, x, last, y) };
                let request = json!({"selection":target,"clipboardJson":clip,"prefix":"flow-paste","right":"flow-right"});
                assert!(a.paste_general_flow_clipboard_namespace_json_guarded(
                    &a.observe()?,
                    &request.to_string()
                )?);
                let after = a.document_json().to_owned();
                assert_ne!(after, source);
                assert!(after.contains("flow-paste:i:"));
                assert!(after.contains("flow-right"));
                assert_eq!(a.undo_count(), 1);
                let exact = saved(&a)?;
                let mut b = restore(&p, &a, &exact)?;
                assert_eq!(saved(&b)?, exact);
                for redo in [false, true, false, true] {
                    if redo {
                        a.redo()?;
                        b.redo()?;
                    } else {
                        a.undo()?;
                        b.undo()?;
                    }
                    assert_eq!(saved(&a)?, saved(&b)?);
                    if redo {
                        assert_eq!(a.document_json(), after);
                    } else {
                        assert_eq!(a.document_json(), source);
                        assert_eq!(a.selection()?, Some(before.clone()));
                        let v: Value = serde_json::from_str(&a.view_json()?)?;
                        assert_eq!(v["pendingFormatsJson"], before_view["pendingFormatsJson"]);
                    }
                }
            }
        }
    }
    Ok(())
}
#[test]
fn caret_paste_routes_original_suffix_and_offline_peer_text_survives_selective_undo() -> Result {
    let (p, mut a) = setup()?;
    a.enable_general_ranges_guarded(&a.observe()?)?;
    let clip = clipboard(&mut a, "list")?;
    a.set_selection(Some(&range("q1", 2, "q1", 2)))?;
    let mut b = p.join_frame("room".into(), "202".into(), &a.update_frame()?)?;
    a.paste_general_flow_clipboard_namespace_json_guarded(&a.observe()?,&json!({"selection":range("q1",2,"q1",2),"clipboardJson":clip,"prefix":"caret-flow","right":"caret-right"}).to_string())?;
    b.apply(vec![Command::InsertText(InsertText {
        block: "q1".into(),
        offset: 4,
        text: "peer".into(),
    })])?;
    a.receive_frame(&b.update_frame()?)?;
    let merged = a.document_json().to_owned();
    assert!(merged.contains("peer"));
    let mut recovered = restore(&p, &a, &saved(&a)?)?;
    a.undo()?;
    recovered.undo()?;
    assert_eq!(saved(&a)?, saved(&recovered)?);
    assert!(a.document_json().contains("peer"));
    assert!(!a.document_json().contains("caret-right"));
    a.redo()?;
    recovered.redo()?;
    assert_eq!(a.document_json(), merged);
    assert_eq!(saved(&a)?, saved(&recovered)?);
    Ok(())
}
#[test]
fn wrong_mode_kind_ids_payload_and_unsupported_caption_are_atomic() -> Result {
    let (_p, mut a) = setup()?;
    let clip = clipboard(&mut a, "image")?;
    let request = json!({"selection":range("p-0-0",1,"p-1-1",3),"clipboardJson":clip,"prefix":"flow-paste","right":"flow-right"});
    let observation = a.observe()?;
    let exact = a.checkpoint()?;
    assert!(
        a.paste_general_flow_clipboard_namespace_json_guarded(&observation, &request.to_string())
            .is_err()
    );
    assert_eq!(a.checkpoint()?, exact);
    a.enable_general_ranges_guarded(&observation)?;
    let exact = saved(&a)?;
    for (field, value) in [
        ("right", json!("q2")),
        ("right", json!("flow-paste:range:0")),
        ("prefix", json!("x".repeat(91))),
        ("extra", json!(true)),
        ("selection", serde_json::to_value(range("caption", 1, "q1", 2))?),
        ("clipboardJson", json!("{}")),
    ] {
        let mut bad = request.clone();
        bad[field] = value;
        assert!(
            a.paste_general_flow_clipboard_namespace_json_guarded(&a.observe()?, &bad.to_string())
                .is_err(),
            "{field}"
        );
        assert_eq!(saved(&a)?, exact);
    }
    a.set_read_only_guarded(&a.observe()?, true)?;
    let exact = saved(&a)?;
    assert!(
        a.paste_general_flow_clipboard_namespace_json_guarded(&a.observe()?, &request.to_string())
            .is_err()
    );
    assert_eq!(saved(&a)?, exact);
    Ok(())
}

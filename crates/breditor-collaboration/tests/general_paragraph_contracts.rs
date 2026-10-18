//! One causal general Enter action, exact actual before-UI, independent peer text and recovery.
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
fn range(first_block: &str, first_offset: u32, last_block: &str, last_offset: u32) -> Selection {
    let point =
        |id: &str, offset| TextPoint { block: id.into(), offset, affinity: Affinity::After };
    Selection::TextRange {
        anchor: point(first_block, first_offset),
        focus: point(last_block, last_offset),
    }
}
fn setup() -> Result<(SharedRichProfile, RichReplica)> {
    let p=SharedRichProfile::from_standard_configuration_json_v3(&json!({"format":"breditor/shared-rich-profile","formatVersion":3,"schema":{"name":"example/shared-general-paragraph","version":1},"extensions":[]}).to_string())?;
    let input=json!({"format":"breditor/document","formatVersion":2,"schema":{"name":"example/shared-general-paragraph","version":1},"schemaFingerprint":p.schema().fingerprint().to_string(),"root":fixture::root()}).to_string();
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
#[test]
fn paragraph_list_and_task_enter_keep_one_group_actual_ui_and_exact_future_recovery() -> Result {
    for natural in [false, true] {
        for backward in [false, true] {
            for (first, last) in [
                ("p-0-0", "p-1-1"),
                ("z-intro", "code"),
                ("nested-text", "task-head"),
                ("task-head", "code"),
            ] {
                let (p, mut a) = setup()?;
                a.enable_general_ranges_guarded(&a.observe()?)?;
                if natural {
                    a.enable_typing_history_guarded(&a.observe()?)?;
                }
                let actual = range("q2", 1, "q2", 1);
                a.set_selection(Some(&actual))?;
                a.set_pending_formats(Some(&[
                    json!({"type":"breditor-inline/italic","properties":{}}),
                ]))?;
                let before = a.document_json().to_owned();
                let before_ui: Value = serde_json::from_str(&a.view_json()?)?;
                let target =
                    if backward { range(last, 1, first, 1) } else { range(first, 1, last, 1) };
                assert!(a.insert_general_paragraph_namespace_json_guarded(
                    &a.observe()?,
                    &json!({"selection":target,"prefix":"enter"}).to_string()
                )?);
                let after = a.document_json().to_owned();
                assert!(after.contains("enter:paragraph"));
                assert_eq!(a.undo_count(), 1);
                let checkpoint = saved(&a)?;
                let mut b = restore(&p, &a, &checkpoint)?;
                assert_eq!(saved(&b)?, checkpoint);
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
                        assert_eq!(a.document_json(), before);
                        assert_eq!(a.selection()?, Some(actual.clone()));
                        let ui: Value = serde_json::from_str(&a.view_json()?)?;
                        assert_eq!(ui["pendingFormatsJson"], before_ui["pendingFormatsJson"]);
                    }
                }
            }
        }
    }
    Ok(())
}
#[test]
fn offline_suffix_text_survives_enter_selective_undo_and_exact_restart() -> Result {
    let (p, mut a) = setup()?;
    a.enable_general_ranges_guarded(&a.observe()?)?;
    let mut b = p.join_frame("room".into(), "202".into(), &a.update_frame()?)?;
    a.insert_general_paragraph_namespace_json_guarded(
        &a.observe()?,
        &json!({"selection":range("p-0-0",1,"p-1-1",1),"prefix":"enter"}).to_string(),
    )?;
    b.apply(vec![Command::InsertText(InsertText {
        block: "p-0-0".into(),
        offset: 4,
        text: "peer".into(),
    })])?;
    a.receive_frame(&b.update_frame()?)?;
    assert!(a.document_json().contains("peer"));
    let after = a.document_json().to_owned();
    let mut c = restore(&p, &a, &saved(&a)?)?;
    a.undo()?;
    c.undo()?;
    assert!(a.document_json().contains("peer"));
    assert!(!a.document_json().contains("enter:paragraph"));
    assert_eq!(saved(&a)?, saved(&c)?);
    a.redo()?;
    c.redo()?;
    assert_eq!(a.document_json(), after);
    assert_eq!(saved(&a)?, saved(&c)?);
    Ok(())
}
#[test]
fn paragraph_separates_native_typing_groups_without_controller_fences() -> Result {
    let (p, mut a) = setup()?;
    a.enable_general_ranges_guarded(&a.observe()?)?;
    a.enable_typing_history_guarded(&a.observe()?)?;
    a.set_selection(Some(&range("q2", 1, "q2", 1)))?;
    a.insert_typing_text_guarded(&a.observe()?, "P", 1)?;
    let before = a.document_json().to_owned();
    a.insert_general_paragraph_namespace_json_guarded(
        &a.observe()?,
        &json!({"selection":range("z-intro",1,"code",1),"prefix":"enter"}).to_string(),
    )?;
    let paragraph = a.document_json().to_owned();
    a.insert_typing_text_guarded(&a.observe()?, "Y", 10)?;
    a.insert_typing_text_guarded(&a.observe()?, "Z", 11)?;
    assert_eq!(a.undo_count(), 3);
    let mut b = restore(&p, &a, &saved(&a)?)?;
    for expected in [&paragraph, &before] {
        a.undo()?;
        b.undo()?;
        assert_eq!(a.document_json(), expected);
        assert_eq!(saved(&a)?, saved(&b)?);
    }
    Ok(())
}
#[test]
fn malformed_read_only_stale_and_original_family_requests_are_atomic() -> Result {
    let (_p, mut a) = setup()?;
    let observation = a.observe()?;
    let exact = a.checkpoint()?;
    let request = json!({"selection":range("p-0-0",1,"p-1-1",1),"prefix":"enter"});
    assert!(
        a.insert_general_paragraph_namespace_json_guarded(&observation, &request.to_string())
            .is_err()
    );
    assert_eq!(a.checkpoint()?, exact);
    a.enable_general_ranges_guarded(&observation)?;
    let exact = saved(&a)?;
    for input in [
        "bad".into(),
        request.to_string().replacen(
            "\"prefix\":\"enter\"",
            "\"prefix\":\"enter\",\"prefix\":\"enter\"",
            1,
        ),
        json!({"selection":range("caption",1,"q1",1),"prefix":"enter"}).to_string(),
        json!({"selection":range("q1",1,"q2",1),"prefix":"enter","newItem":"forged"}).to_string(),
    ] {
        assert!(a.insert_general_paragraph_namespace_json_guarded(&a.observe()?, &input).is_err());
        assert_eq!(saved(&a)?, exact);
    }
    a.set_read_only_guarded(&a.observe()?, true)?;
    let exact = saved(&a)?;
    assert!(
        a.insert_general_paragraph_namespace_json_guarded(&a.observe()?, &request.to_string())
            .is_err()
    );
    assert_eq!(saved(&a)?, exact);
    assert!(a.insert_general_paragraph_namespace_json_guarded(&observation, "bad").is_err());
    Ok(())
}

//! Same-protocol code exit: selective owned insertion, peer preservation and exact future replay.
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
const TARGETS: [&str; 6] =
    ["code-root", "code-cell", "code-quote", "code-list", "code-task", "code-last"];
fn setup() -> Result<(SharedRichProfile, RichReplica, RichReplica)> {
    let profile=SharedRichProfile::from_configuration_json_v2(&json!({"format":"breditor/shared-rich-profile","formatVersion":2,"schema":{"name":"example/shared-code-exit","version":1},"extensions":[]}).to_string())?;
    let root: Value = serde_json::from_str(include_str!(
        "../../breditor-core/tests/fixtures/rich-code-exit-root.json"
    ))?;
    let input=json!({"format":"breditor/document","formatVersion":2,"schema":{"name":"example/shared-code-exit","version":1},"schemaFingerprint":profile.schema().fingerprint().to_string(),"root":root}).to_string();
    let a = profile.create(&input, "101".into())?;
    let b = profile.join_frame("room".into(), "202".into(), &a.update_frame()?)?;
    Ok((profile, a, b))
}
fn caret(block: &str, offset: u32) -> Selection {
    let p = TextPoint { block: block.into(), offset, affinity: Affinity::After };
    Selection::TextRange { anchor: p.clone(), focus: p }
}
fn checkpoint(a: &RichReplica) -> Result<String> {
    Ok(if a.typing_history_enabled() { a.typing_checkpoint()? } else { a.checkpoint()? })
}
fn restored(p: &SharedRichProfile, a: &RichReplica) -> Result<RichReplica> {
    let s = checkpoint(a)?;
    Ok(if a.typing_history_enabled() {
        p.restore_typing("room", &s)?
    } else {
        p.restore("room", &s)?
    })
}
fn find<'a>(v: &'a Value, id: &str) -> Option<&'a Value> {
    if v.pointer("/properties/breditor~1block-id").and_then(Value::as_str) == Some(id) {
        return Some(v);
    }
    v.get("children")?.as_array()?.iter().find_map(|n| find(n, id))
}
fn document(a: &RichReplica) -> Result<Value> {
    Ok(serde_json::from_str(a.document_json())?)
}
fn sync(a: &mut RichReplica, b: &mut RichReplica) -> Result {
    let x = a.update_frame()?;
    let y = b.update_frame()?;
    a.receive_frame(&y)?;
    b.receive_frame(&x)?;
    assert_eq!(a.document_json(), b.document_json());
    Ok(())
}

#[test]
fn all_code_contexts_keep_the_same_parent_source_and_recovered_selective_history() -> Result {
    for typing in [false, true] {
        for target in TARGETS {
            let (p, mut a, _) = setup()?;
            if typing {
                a.enable_typing_history_guarded(&a.observe()?)?;
            }
            a.set_selection(Some(&caret(target, u32::from(target != "code-last"))))?;
            let before = document(&a)?;
            let code = find(&before["root"], target).ok_or("code")?.clone();
            assert!(a.exit_code_block_guarded(&a.observe()?, "exit-paragraph")?);
            assert_eq!(a.undo_count(), 1);
            assert_eq!(a.selection()?, Some(caret("exit-paragraph", 0)));
            let after = document(&a)?;
            assert_eq!(find(&after["root"], target), Some(&code));
            assert_eq!(
                find(&after["root"], "exit-paragraph").ok_or("paragraph")?["children"],
                json!([])
            );
            let v: Value = serde_json::from_str(&a.view_json()?)?;
            assert_eq!(v["pendingFormatsJson"], Value::Null);
            let record: Value = serde_json::from_str(&checkpoint(&a)?)?;
            let journal = if typing { &record["journal"] } else { &record };
            assert_eq!(journal["entries"][0]["commands"][0]["kind"], "insert_blocks");
            let mut b = restored(&p, &a)?;
            for redo in [false, true, false, true] {
                assert_eq!(
                    if redo { a.redo()? } else { a.undo()? },
                    if redo { b.redo()? } else { b.undo()? }
                );
                assert_eq!(checkpoint(&a)?, checkpoint(&b)?);
                assert_eq!(document(&a)?, if redo { after.clone() } else { before.clone() });
            }
        }
    }
    Ok(())
}

#[test]
fn concurrent_exits_and_peer_code_edits_survive_local_undo_and_original_order_redo() -> Result {
    let (p, mut a, mut b) = setup()?;
    for owner in [&mut a, &mut b] {
        owner.set_selection(Some(&caret("code-root", 1)))?;
    }
    a.exit_code_block_guarded(&a.observe()?, "a-exit")?;
    b.exit_code_block_guarded(&b.observe()?, "b-exit")?;
    b.apply(vec![Command::InsertText(InsertText {
        block: "code-root".into(),
        offset: 0,
        text: "Peer ".into(),
    })])?;
    sync(&mut a, &mut b)?;
    let both = a.document_json().to_owned();
    let code = find(&document(&a)?["root"], "code-root").ok_or("code")?.clone();
    assert!(a.undo()?);
    let d = document(&a)?;
    assert!(find(&d["root"], "a-exit").is_none());
    assert!(find(&d["root"], "b-exit").is_some());
    assert_eq!(find(&d["root"], "code-root"), Some(&code));
    let mut recovered = restored(&p, &a)?;
    assert_eq!(a.redo()?, recovered.redo()?);
    assert_eq!(a.document_json(), both);
    assert_eq!(a.checkpoint()?, recovered.checkpoint()?);
    sync(&mut a, &mut b)?;
    assert_eq!(a.document_json(), both);
    Ok(())
}

#[test]
fn creator_undo_hides_but_retains_peer_text_for_redo_and_exact_restart() -> Result {
    for typing in [false, true] {
        let (profile, mut a, mut b) = setup()?;
        if typing {
            a.enable_typing_history_guarded(&a.observe()?)?;
        }
        a.set_selection(Some(&caret("code-root", 1)))?;
        a.exit_code_block_guarded(&a.observe()?, "a-exit")?;
        sync(&mut a, &mut b)?;
        b.apply(vec![Command::InsertText(InsertText {
            block: "a-exit".into(),
            offset: 0,
            text: "Peer 🙂".into(),
        })])?;
        sync(&mut a, &mut b)?;
        let visible = a.document_json().to_owned();
        assert_eq!(
            find(&document(&a)?["root"], "a-exit").ok_or("paragraph")?["children"][0],
            json!({"kind":"text","text":"Peer 🙂","formats":[]})
        );
        assert!(a.undo()?);
        sync(&mut a, &mut b)?;
        assert!(find(&document(&a)?["root"], "a-exit").is_none());
        let mut recovered = restored(&profile, &a)?;
        assert_eq!(checkpoint(&a)?, checkpoint(&recovered)?);
        for redo in [true, false, true] {
            assert_eq!(
                if redo { a.redo()? } else { a.undo()? },
                if redo { recovered.redo()? } else { recovered.undo()? }
            );
            assert_eq!(checkpoint(&a)?, checkpoint(&recovered)?);
            if redo {
                assert_eq!(a.document_json(), visible);
            }
        }
        sync(&mut a, &mut b)?;
        assert_eq!(a.document_json(), visible);
    }
    Ok(())
}

#[test]
fn code_input_exit_and_new_plain_input_keep_three_native_groups() -> Result {
    let (_, mut a, _) = setup()?;
    a.enable_typing_history_guarded(&a.observe()?)?;
    a.set_selection(Some(&caret("code-root", 1)))?;
    for (clock, text) in [(1, "X"), (2, "Y")] {
        a.insert_typing_text_guarded(&a.observe()?, text, clock)?;
    }
    let code = a.document_json().to_owned();
    a.exit_code_block_guarded(&a.observe()?, "exit-paragraph")?;
    for (clock, text) in [(3, "A"), (4, "B")] {
        a.insert_typing_text_guarded(&a.observe()?, text, clock)?;
    }
    assert_eq!(a.undo_count(), 3);
    let d = document(&a)?;
    assert_eq!(
        find(&d["root"], "exit-paragraph").ok_or("paragraph")?["children"][0],
        json!({"kind":"text","text":"AB","formats":[]})
    );
    a.undo()?;
    a.undo()?;
    assert_eq!(a.document_json(), code);
    Ok(())
}

#[test]
fn invalid_selection_identity_policy_and_stale_guards_keep_every_published_field() -> Result {
    let (_, mut a, _) = setup()?;
    let mut range = caret("code-root", 0);
    if let Selection::TextRange { focus, .. } = &mut range {
        focus.offset = 1;
    }
    for selection in [caret("p", 0), Selection::Node { block: "code-root".into() }, range] {
        a.set_selection(Some(&selection))?;
        let before = a.checkpoint()?;
        assert!(a.exit_code_block_guarded(&a.observe()?, "fresh").is_err());
        assert_eq!(a.checkpoint()?, before);
    }
    a.set_selection(Some(&caret("code-root", 1)))?;
    let before = a.checkpoint()?;
    for fresh in ["p", "", "not an id"] {
        assert!(a.exit_code_block_guarded(&a.observe()?, fresh).is_err());
        assert_eq!(a.checkpoint()?, before);
    }
    let stale = a.observe()?;
    a.set_read_only_guarded(&a.observe()?, true)?;
    let before = a.checkpoint()?;
    assert!(a.exit_code_block_guarded(&stale, "").is_err());
    assert!(a.exit_code_block_guarded(&a.observe()?, "fresh").is_err());
    assert_eq!(a.checkpoint()?, before);
    Ok(())
}

#[test]
fn original_v1_and_late_node_limits_reject_without_widening_or_partial_publication() -> Result {
    fn nodes(v: &Value) -> usize {
        1 + v
            .get("children")
            .and_then(Value::as_array)
            .map_or(0, |a| a.iter().map(nodes).sum::<usize>())
    }
    let old=SharedRichProfile::from_configuration_json(&json!({"format":"breditor/shared-rich-profile","formatVersion":1,"schema":{"name":"example/legacy-code-exit","version":1},"extensions":[]}).to_string())?;
    let root: Value = serde_json::from_str(include_str!(
        "../../breditor-core/tests/fixtures/rich-local-root.json"
    ))?;
    let mut a=old.create(&json!({"format":"breditor/document","formatVersion":2,"schema":{"name":"example/legacy-code-exit","version":1},"schemaFingerprint":old.schema().fingerprint().to_string(),"root":root}).to_string(),"101".into())?;
    let before = a.checkpoint()?;
    assert!(a.exit_code_block_guarded(&a.observe()?, "fresh").is_err());
    assert_eq!(a.checkpoint()?, before);
    let (profile, original, _) = setup()?;
    let count = nodes(&document(&original)?["root"]);
    let limited = SharedRichProfile::from_schema_v2(
        profile.schema().clone(),
        profile.limits().clone().with_max_nodes(count),
    )?;
    let mut a = limited.create(original.document_json(), "303".into())?;
    a.set_selection(Some(&caret("code-root", 1)))?;
    let before = a.checkpoint()?;
    assert!(a.exit_code_block_guarded(&a.observe()?, "fresh").is_err());
    assert_eq!(a.checkpoint()?, before);
    Ok(())
}

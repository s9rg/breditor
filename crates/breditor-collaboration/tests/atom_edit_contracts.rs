//! Native whole-atom edits keep original causal commands, selective ownership and replay.
#[path = "../../breditor-core/tests/support/atom_fixture.rs"]
mod fixture;
use breditor_collaboration::{
    anchor::Affinity,
    rich_replica::{
        Command, RichReplica, SharedRichProfile,
        actions::InsertText,
        selection::{Selection, TextPoint},
    },
};
use breditor_core::{rich_content::FlowMove, schema::DocumentLimits};
use serde_json::{Value, json};
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;
fn node(id: &str) -> Selection {
    Selection::Node { block: id.into() }
}
fn text(id: &str, offset: u32) -> Selection {
    let p = TextPoint { block: id.into(), offset, affinity: Affinity::After };
    Selection::TextRange { anchor: p.clone(), focus: p }
}
fn setup(
    language: u32,
    root: &Value,
    target: &str,
    limit: Option<usize>,
) -> Result<(SharedRichProfile, RichReplica, RichReplica)> {
    let config=json!({"format":"breditor/shared-rich-profile","formatVersion":language,"schema":{"name":"example/shared-atom","version":1},"extensions":[]}).to_string();
    let base = if language == 2 {
        SharedRichProfile::from_configuration_json_v2(&config)?
    } else {
        SharedRichProfile::from_configuration_json(&config)?
    };
    let profile = if let Some(limit) = limit {
        let limits = DocumentLimits::default().with_max_nodes(limit);
        if language == 2 {
            SharedRichProfile::from_schema_v2(base.schema().clone(), limits)?
        } else {
            SharedRichProfile::from_schema(base.schema().clone(), limits)?
        }
    } else {
        base
    };
    let input=json!({"format":"breditor/document","formatVersion":2,"schema":{"name":"example/shared-atom","version":1},"schemaFingerprint":profile.schema().fingerprint().to_string(),"root":root}).to_string();
    let mut a = profile.create(&input, "101".into())?;
    a.set_selection(Some(&node(target)))?;
    let b = profile.join_frame("room".into(), "202".into(), &a.update_frame()?)?;
    Ok((profile, a, b))
}
fn checkpoint(a: &RichReplica) -> Result<String> {
    Ok(if a.typing_history_enabled() { a.typing_checkpoint()? } else { a.checkpoint()? })
}
fn restore(p: &SharedRichProfile, a: &RichReplica) -> Result<RichReplica> {
    Ok(if a.typing_history_enabled() {
        p.restore_typing("room", &checkpoint(a)?)?
    } else {
        p.restore("room", &checkpoint(a)?)?
    })
}
fn doc(a: &RichReplica) -> Result<Value> {
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
fn history(p: &SharedRichProfile, a: &mut RichReplica, before: &str) -> Result {
    let mut b = restore(p, a)?;
    for redo in [false, true, false, true] {
        assert_eq!(
            if redo { a.redo()? } else { a.undo()? },
            if redo { b.redo()? } else { b.undo()? }
        );
        assert_eq!(checkpoint(a)?, checkpoint(&b)?);
        if !redo {
            assert_eq!(a.document_json(), before);
        }
    }
    Ok(())
}
#[test]
fn original_commands_delete_atoms_and_recover_in_each_native_flow_with_exact_future() -> Result {
    for language in [1, 2] {
        for kind in ["image", "table", "rule"] {
            for parent in ["root", "cell", "list", "task", "quote"] {
                if language == 1 && (kind == "rule" || matches!(parent, "task" | "quote"))
                    || kind == "table" && parent == "cell"
                {
                    continue;
                }
                for direction in [FlowMove::Before, FlowMove::After] {
                    let (root, target) = fixture::fixture(kind, parent, false, false)?;
                    let (p, mut a, _) = setup(language, &root, target, None)?;
                    let before = a.document_json().to_owned();
                    assert!(a.delete_atom_guarded(&a.observe()?, "unused", direction)?);
                    let actual = a.selection()?.and_then(|s| s.caret().cloned()).ok_or("caret")?;
                    assert_eq!(
                        actual.block,
                        if direction == FlowMove::Before { "left" } else { "right" }
                    );
                    assert_eq!(actual.offset, if direction == FlowMove::Before { 4 } else { 0 });
                    assert!(fixture::find(&doc(&a)?["root"], target).is_none());
                    assert!(fixture::find(&doc(&a)?["root"], "unused").is_none());
                    history(&p, &mut a, &before)?;
                }
            }
        }
    }
    Ok(())
}
#[test]
fn sole_and_hidden_only_flows_get_fresh_floors_without_escaping_containers() -> Result {
    for (kind, parent) in
        [("image", "root"), ("table", "root"), ("image", "cell"), ("rule", "quote")]
    {
        for hidden in [false, true] {
            if hidden && parent == "cell" {
                continue; // A hidden table is still a table: nested tables remain forbidden.
            }
            let (root, target) = fixture::fixture(kind, parent, true, hidden)?;
            let (p, mut a, _) = setup(2, &root, target, None)?;
            let before = a.document_json().to_owned();
            assert!(a.delete_atom_guarded(&a.observe()?, "floor", FlowMove::After)?);
            assert_eq!(a.selection()?, Some(text("floor", 0)));
            assert!(fixture::find(&doc(&a)?["root"], target).is_none());
            history(&p, &mut a, &before)?;
        }
    }
    Ok(())
}
#[test]
fn explicit_plain_replacement_preserves_empty_unicode_and_original_saved_command_tags() -> Result {
    for language in [1, 2] {
        for kind in ["image", "table", "rule"] {
            if language == 1 && kind == "rule" {
                continue;
            }
            for input in ["", "Q🙂e\u{301}", "a\r\n\tb"] {
                let (root, target) = fixture::fixture(kind, "root", true, false)?;
                let (p, mut a, _) = setup(language, &root, target, None)?;
                let before = a.document_json().to_owned();
                a.replace_atom_plain_text_guarded(&a.observe()?, "replacement", input)?;
                assert_eq!(
                    a.selection()?,
                    Some(text("replacement", u32::try_from(input.encode_utf16().count())?))
                );
                assert_eq!(a.pending_formats(), Some([].as_slice()));
                let saved: Value = serde_json::from_str(&checkpoint(&a)?)?;
                assert_eq!(saved["entries"][0]["commands"][0]["kind"], "insert_blocks");
                assert_eq!(saved["entries"][0]["commands"][1]["kind"], "delete_block");
                history(&p, &mut a, &before)?;
            }
        }
    }
    Ok(())
}
#[test]
fn atom_first_key_and_following_text_are_one_native_group_and_replay_exactly() -> Result {
    for kind in ["image", "table", "rule"] {
        let (root, target) = fixture::fixture(kind, "root", true, false)?;
        let (p, mut a, _) = setup(2, &root, target, None)?;
        a.enable_typing_history_guarded(&a.observe()?)?;
        let before = a.document_json().to_owned();
        let unchanged = checkpoint(&a)?;
        assert!(!a.replace_atom_typing_text_guarded(&a.observe()?, target, "", 100)?);
        assert_eq!(checkpoint(&a)?, unchanged);
        a.replace_atom_typing_text_guarded(&a.observe()?, "replacement", "Q", 100)?;
        a.insert_typing_text_guarded(&a.observe()?, "🙂", 200)?;
        a.insert_typing_text_guarded(&a.observe()?, "e\u{301}", 300)?;
        assert_eq!((a.undo_count(), a.history_step_count()), (1, 3));
        assert_eq!(a.selection()?, Some(text("replacement", 5)));
        let mut b = restore(&p, &a)?;
        b.insert_typing_text_guarded(&b.observe()?, "!", 301)?;
        assert_eq!(b.undo_count(), 2);
        history(&p, &mut a, &before)?;
    }
    Ok(())
}
#[test]
fn peer_source_edits_survive_deletion_and_replacement_and_peer_replacement_edits_survive_redo()
-> Result {
    for replacement in [false, true] {
        let (root, target) = fixture::fixture("image", "root", true, false)?;
        let (p, mut a, mut b) = setup(2, &root, target, None)?;
        if replacement {
            a.replace_atom_plain_text_guarded(&a.observe()?, "replacement", "Q")?;
        } else {
            a.delete_atom_guarded(&a.observe()?, "replacement", FlowMove::After)?;
        }
        b.apply(vec![Command::InsertText(InsertText {
            block: "caption".into(),
            offset: 0,
            text: "PEER".into(),
        })])?;
        sync(&mut a, &mut b)?;
        a.undo()?;
        sync(&mut a, &mut b)?;
        assert!(
            fixture::find(&doc(&a)?["root"], "caption")
                .ok_or("caption")?
                .to_string()
                .contains("PEER")
        );
        a.redo()?;
        sync(&mut a, &mut b)?;
        b.apply(vec![Command::InsertText(InsertText {
            block: "replacement".into(),
            offset: 0,
            text: "REMOTE".into(),
        })])?;
        sync(&mut a, &mut b)?;
        let mut recovered = restore(&p, &a)?;
        for redo in [false, true] {
            if redo {
                a.redo()?;
                recovered.redo()?;
            } else {
                a.undo()?;
                recovered.undo()?;
            }
            assert_eq!(checkpoint(&a)?, checkpoint(&recovered)?);
            if redo {
                assert!(
                    fixture::find(&doc(&a)?["root"], "replacement")
                        .ok_or("replacement")?
                        .to_string()
                        .contains("REMOTE")
                );
            }
        }
    }
    Ok(())
}
#[test]
fn policy_stale_freshness_and_transient_budget_refusals_preserve_every_published_field() -> Result {
    let (root, target) = fixture::fixture("image", "root", true, false)?;
    let (_, mut a, _) = setup(2, &root, target, None)?;
    let before = checkpoint(&a)?;
    assert!(a.replace_atom_typing_text_guarded(&a.observe()?, "fresh", "Q", 1).is_err());
    assert!(a.replace_atom_plain_text_guarded(&a.observe()?, target, "Q").is_err());
    assert!(a.delete_atom_guarded(&a.observe()?, target, FlowMove::After).is_err());
    assert_eq!(checkpoint(&a)?, before);
    let stale = a.observe()?;
    a.set_read_only_guarded(&a.observe()?, true)?;
    let before = checkpoint(&a)?;
    assert!(a.replace_atom_plain_text_guarded(&stale, "fresh", "Q").is_err());
    assert!(a.delete_atom_guarded(&a.observe()?, "fresh", FlowMove::After).is_err());
    assert!(a.replace_atom_plain_text_guarded(&a.observe()?, "fresh", "Q").is_err());
    assert_eq!(checkpoint(&a)?, before);
    let (_, mut a, _) = setup(2, &root, target, Some(fixture::count(&root)))?;
    let before = checkpoint(&a)?;
    let frame = a.update_frame()?;
    let clocks = a.causal_version();
    assert!(a.replace_atom_plain_text_guarded(&a.observe()?, "fresh", "Q").is_err());
    assert!(a.delete_atom_guarded(&a.observe()?, "fresh", FlowMove::After).is_err());
    assert_eq!(checkpoint(&a)?, before);
    assert_eq!(a.update_frame()?, frame);
    assert_eq!(a.causal_version(), clocks);
    Ok(())
}

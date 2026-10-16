//! Native shared flow navigation is UI-only; adjacent text uses existing selective creation.
use breditor_collaboration::{
    anchor::Affinity,
    rich_replica::{
        Command, RichReplica, SharedRichProfile,
        actions::InsertText,
        selection::{Selection, TextPoint},
    },
};
use breditor_core::rich_content::FlowMove;
use serde_json::{Value, json};
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;
fn text(block: &str, offset: u32) -> Selection {
    let p = TextPoint { block: block.into(), offset, affinity: Affinity::After };
    Selection::TextRange { anchor: p.clone(), focus: p }
}
fn node(block: &str) -> Selection {
    Selection::Node { block: block.into() }
}
fn prose(id: &str, value: &str) -> Value {
    json!({"kind":"element","type":"breditor/paragraph","entityId":null,"properties":{"breditor/block-id":id},"children":[{"kind":"text","text":value,"formats":[]}]})
}
fn setup(language: u32) -> Result<(SharedRichProfile, RichReplica, RichReplica)> {
    let config=json!({"format":"breditor/shared-rich-profile","formatVersion":language,"schema":{"name":"example/shared-flow-navigation","version":1},"extensions":[]}).to_string();
    let profile = if language == 2 {
        SharedRichProfile::from_configuration_json_v2(&config)?
    } else {
        SharedRichProfile::from_configuration_json(&config)?
    };
    let old: Value = serde_json::from_str(include_str!(
        "../../breditor-core/tests/fixtures/rich-local-root.json"
    ))?;
    let mut root: Value = if language == 2 {
        serde_json::from_str(include_str!(
            "../../breditor-core/tests/fixtures/rich-code-exit-root.json"
        ))?
    } else {
        old.clone()
    };
    let children = root["children"].as_array_mut().ok_or("children")?;
    children.insert(0, prose("before", "a🙂b"));
    if language == 2 {
        let mut hidden = children[1].clone();
        hidden["properties"]["breditor/block-id"] = json!("hidden-table");
        hidden["properties"]["breditor/table-id"] = json!("hidden-t");
        hidden["children"] = json!([]);
        children.insert(3, hidden);
        children.push(old["children"][0]["children"][0]["children"][0]["children"][1].clone());
    }
    children.push(prose("after", "End"));
    let input=json!({"format":"breditor/document","formatVersion":2,"schema":{"name":"example/shared-flow-navigation","version":1},"schemaFingerprint":profile.schema().fingerprint().to_string(),"root":root}).to_string();
    let a = profile.create(&input, "101".into())?;
    let b = profile.join_frame("room".into(), "202".into(), &a.update_frame()?)?;
    Ok((profile, a, b))
}
fn checkpoint(a: &RichReplica) -> Result<String> {
    Ok(if a.typing_history_enabled() { a.typing_checkpoint()? } else { a.checkpoint()? })
}
fn restore(profile: &SharedRichProfile, a: &RichReplica) -> Result<RichReplica> {
    Ok(if a.typing_history_enabled() {
        profile.restore_typing("room", &checkpoint(a)?)?
    } else {
        profile.restore("room", &checkpoint(a)?)?
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
fn count(v: &Value) -> usize {
    1 + v
        .get("children")
        .and_then(Value::as_array)
        .map_or(0, |a| a.iter().map(count).sum::<usize>())
}

#[test]
fn navigation_is_native_local_ui_and_preserves_shared_causal_frames_and_redo() -> Result {
    for language in [1, 2] {
        let (profile, mut a, _) = setup(language)?;
        a.set_selection(Some(&text("before", 4)))?;
        a.insert_plain_text_guarded(&a.observe()?, "Q")?;
        a.undo()?;
        let frame = a.update_frame()?;
        let content = a.document_json().to_owned();
        let clocks = a.causal_version();
        a.set_read_only_guarded(&a.observe()?, true)?;
        assert!(a.navigate_flow_guarded(&a.observe()?, FlowMove::After)?);
        assert_eq!(a.selection()?, Some(node("table-block")));
        assert_eq!(a.redo_count(), 1);
        assert_eq!(a.undo_count(), 0);
        assert_eq!(a.update_frame()?, frame);
        assert_eq!(a.document_json(), content);
        assert_eq!(a.causal_version(), clocks);
        a.navigate_flow_guarded(&a.observe()?, FlowMove::Before)?;
        assert_eq!(a.selection()?.and_then(|s| s.caret().cloned()).ok_or("caret")?.offset, 4);
        a.set_read_only_guarded(&a.observe()?, false)?;
        // Recovery is compared at the same publication, not across a later
        // live host-policy change (permission itself is deliberately not saved).
        let mut b = restore(&profile, &a)?;
        for redo in [true, false, true] {
            assert_eq!(
                if redo { a.redo()? } else { a.undo()? },
                if redo { b.redo()? } else { b.undo()? }
            );
            assert_eq!(checkpoint(&a)?, checkpoint(&b)?);
        }
    }
    Ok(())
}

#[test]
fn hidden_atoms_transparent_flow_and_domains_keep_original_native_boundaries() -> Result {
    let (_, mut a, _) = setup(2)?;
    a.set_selection(Some(&text("code-root", 7)))?;
    a.navigate_flow_guarded(&a.observe()?, FlowMove::After)?;
    assert_eq!(a.selection()?, Some(node("root-next")));
    a.navigate_flow_guarded(&a.observe()?, FlowMove::After)?;
    assert_eq!(a.selection()?, Some(text("code-quote", 0)));
    for (source, movement) in [
        (text("p", 0), FlowMove::Before),
        (text("cell-next", 9), FlowMove::After),
        (text("caption", 0), FlowMove::Before),
        (text("caption", 4), FlowMove::After),
        (text("before", 1), FlowMove::After),
    ] {
        a.set_selection(Some(&source))?;
        let before = checkpoint(&a)?;
        assert!(!a.navigate_flow_guarded(&a.observe()?, movement)?);
        assert_eq!(checkpoint(&a)?, before);
    }
    let mut range = text("before", 4);
    if let Selection::TextRange { focus, .. } = &mut range {
        focus.offset = 0;
    }
    a.set_selection(Some(&range))?;
    let before = checkpoint(&a)?;
    assert!(!a.navigate_flow_guarded(&a.observe()?, FlowMove::After)?);
    assert_eq!(checkpoint(&a)?, before);
    assert_eq!(a.selection()?, Some(range));
    Ok(())
}

#[test]
fn adjacent_paragraphs_retain_atom_source_original_command_family_and_exact_recovered_history()
-> Result {
    for language in [1, 2] {
        for target in if language == 1 {
            vec!["table-block", "image-block"]
        } else {
            vec!["table-block", "image-block", "root-next"]
        } {
            for movement in [FlowMove::Before, FlowMove::After] {
                for typing in [false, true] {
                    let (profile, mut a, _) = setup(language)?;
                    if typing {
                        a.enable_typing_history_guarded(&a.observe()?)?;
                    }
                    a.set_selection(Some(&node(target)))?;
                    let before = a.document_json().to_owned();
                    let original = find(&document(&a)?["root"], target).ok_or("atom")?.clone();
                    assert!(a.insert_paragraph_adjacent_guarded(
                        &a.observe()?,
                        "fresh",
                        movement
                    )?);
                    assert_eq!(a.selection()?, Some(text("fresh", 0)));
                    assert_eq!(a.undo_count(), 1);
                    assert_eq!(find(&document(&a)?["root"], target), Some(&original));
                    let saved: Value = serde_json::from_str(&checkpoint(&a)?)?;
                    let journal = if typing { &saved["journal"] } else { &saved };
                    assert_eq!(journal["entries"][0]["commands"][0]["kind"], "insert_blocks");
                    let mut b = restore(&profile, &a)?;
                    for redo in [false, true, false, true] {
                        assert_eq!(
                            if redo { a.redo()? } else { a.undo()? },
                            if redo { b.redo()? } else { b.undo()? }
                        );
                        assert_eq!(checkpoint(&a)?, checkpoint(&b)?);
                        if !redo {
                            assert_eq!(a.document_json(), before);
                        }
                    }
                }
            }
        }
    }
    Ok(())
}

#[test]
fn concurrent_adjacent_insertions_and_foreign_text_survive_selective_undo_and_redo() -> Result {
    let (profile, mut a, mut b) = setup(2)?;
    for peer in [&mut a, &mut b] {
        peer.set_selection(Some(&node("root-next")))?;
    }
    a.insert_paragraph_adjacent_guarded(&a.observe()?, "a-paragraph", FlowMove::After)?;
    b.insert_paragraph_adjacent_guarded(&b.observe()?, "b-paragraph", FlowMove::After)?;
    sync(&mut a, &mut b)?;
    b.apply(vec![Command::InsertText(InsertText {
        block: "a-paragraph".into(),
        offset: 0,
        text: "Peer 🙂".into(),
    })])?;
    sync(&mut a, &mut b)?;
    let both = a.document_json().to_owned();
    assert!(a.undo()?);
    let d = document(&a)?;
    assert!(find(&d["root"], "a-paragraph").is_none());
    assert!(find(&d["root"], "b-paragraph").is_some());
    assert!(find(&d["root"], "root-next").is_some());
    let mut recovered = restore(&profile, &a)?;
    assert_eq!(a.redo()?, recovered.redo()?);
    assert_eq!(a.document_json(), both);
    assert_eq!(checkpoint(&a)?, checkpoint(&recovered)?);
    sync(&mut a, &mut b)?;
    Ok(())
}

#[test]
fn stale_policy_wrong_target_duplicate_and_late_node_limit_fail_without_publication() -> Result {
    let (profile, mut a, b) = setup(2)?;
    a.set_selection(Some(&text("before", 4)))?;
    let before = checkpoint(&a)?;
    assert!(a.navigate_flow_guarded(&b.observe()?, FlowMove::After).is_err());
    assert!(a.insert_paragraph_adjacent_guarded(&a.observe()?, "fresh", FlowMove::After).is_err());
    assert_eq!(checkpoint(&a)?, before);
    a.set_selection(Some(&node("table-block")))?;
    let before = checkpoint(&a)?;
    assert!(a.insert_paragraph_adjacent_guarded(&a.observe()?, "p", FlowMove::After).is_err());
    assert_eq!(checkpoint(&a)?, before);
    let stale = a.observe()?;
    a.set_read_only_guarded(&a.observe()?, true)?;
    let before = checkpoint(&a)?;
    assert!(a.navigate_flow_guarded(&stale, FlowMove::After).is_err());
    assert!(a.insert_paragraph_adjacent_guarded(&a.observe()?, "fresh", FlowMove::After).is_err());
    assert_eq!(checkpoint(&a)?, before);
    let limit = count(&document(&a)?["root"]);
    let limited = SharedRichProfile::from_schema_v2(
        profile.schema().clone(),
        profile.limits().clone().with_max_nodes(limit),
    )?;
    let mut a = limited.create(a.document_json(), "303".into())?;
    a.set_selection(Some(&node("table-block")))?;
    let before = checkpoint(&a)?;
    assert!(a.insert_paragraph_adjacent_guarded(&a.observe()?, "fresh", FlowMove::After).is_err());
    assert_eq!(checkpoint(&a)?, before);
    Ok(())
}

#[test]
fn atom_only_documents_preserve_exact_source_and_gain_plain_text_on_both_sides() -> Result {
    for language in [1, 2] {
        let (profile, seed, _) = setup(language)?;
        for target in if language == 1 {
            vec!["table-block", "image-block"]
        } else {
            vec!["table-block", "image-block", "root-next"]
        } {
            let source = find(&document(&seed)?["root"], target).ok_or("atom")?.clone();
            for movement in [FlowMove::Before, FlowMove::After] {
                let mut input = document(&seed)?;
                input["root"]["children"] = json!([source]);
                let mut a = profile.create(&input.to_string(), "303".into())?;
                a.set_selection(Some(&node(target)))?;
                let before = a.document_json().to_owned();
                assert!(!a.navigate_flow_guarded(&a.observe()?, movement)?);
                a.insert_paragraph_adjacent_guarded(&a.observe()?, "fresh", movement)?;
                assert_eq!(find(&document(&a)?["root"], target), Some(&source));
                assert_eq!(a.selection()?, Some(text("fresh", 0)));
                a.insert_plain_text_guarded(&a.observe()?, "Plain 🙂")?;
                let mut b = restore(&profile, &a)?;
                for redo in [false, false, true, true] {
                    assert_eq!(
                        if redo { a.redo()? } else { a.undo()? },
                        if redo { b.redo()? } else { b.undo()? }
                    );
                    assert_eq!(checkpoint(&a)?, checkpoint(&b)?);
                    if a.undo_count() == 0 {
                        assert_eq!(a.document_json(), before);
                    }
                }
            }
        }
    }
    Ok(())
}

#[test]
fn movement_and_adjacent_creation_keep_three_natural_units_through_exact_restart() -> Result {
    for language in [1, 2] {
        let (profile, mut a, _) = setup(language)?;
        a.enable_typing_history_guarded(&a.observe()?)?;
        a.set_selection(Some(&text("before", 4)))?;
        for (clock, value) in [(1, "X"), (2, "Y")] {
            a.insert_typing_text_guarded(&a.observe()?, value, clock)?;
        }
        let first = a.document_json().to_owned();
        a.navigate_flow_guarded(&a.observe()?, FlowMove::After)?;
        a.insert_paragraph_adjacent_guarded(&a.observe()?, "fresh", FlowMove::After)?;
        for (clock, value) in [(3, "A"), (4, "B")] {
            a.insert_typing_text_guarded(&a.observe()?, value, clock)?;
        }
        assert_eq!(a.undo_count(), 3);
        let mut b = restore(&profile, &a)?;
        for redo in [false, false, false, true, true, true] {
            assert_eq!(
                if redo { a.redo()? } else { a.undo()? },
                if redo { b.redo()? } else { b.undo()? }
            );
            assert_eq!(checkpoint(&a)?, checkpoint(&b)?);
            if a.undo_count() == 1 {
                assert_eq!(a.document_json(), first);
            }
        }
    }
    Ok(())
}

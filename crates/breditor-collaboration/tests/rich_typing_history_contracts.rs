//! Native explicit typing groups, invisible prefix safety and separately replayed future history.
use breditor_collaboration::{
    Error,
    anchor::Affinity,
    rich_replica::{
        Command, RichReplica, SharedRichProfile,
        actions::{DeleteText, InsertText},
        selection::{Selection, TextPoint},
    },
};
use breditor_core::rich_content::RichTypingDeleteDirection;
use serde_json::{Value, json};
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;
fn setup(version: u32) -> Result<(SharedRichProfile, RichReplica, RichReplica)> {
    let config=json!({"format":"breditor/shared-rich-profile","formatVersion":version,"schema":{"name":"example/shared-typing","version":1},"extensions":[]}).to_string();
    let profile = if version == 1 {
        SharedRichProfile::from_configuration_json(&config)?
    } else {
        SharedRichProfile::from_configuration_json_v2(&config)?
    };
    let root: Value = serde_json::from_str(include_str!(
        "../../breditor-core/tests/fixtures/rich-local-root.json"
    ))?;
    let document=json!({"format":"breditor/document","formatVersion":2,"schema":{"name":"example/shared-typing","version":1},"schemaFingerprint":profile.schema().fingerprint().to_string(),"root":root}).to_string();
    let a = profile.create(&document, "101".into())?;
    let b = profile.join_frame("room".into(), "202".into(), &a.update_frame()?)?;
    Ok((profile, a, b))
}
fn point(offset: u32) -> TextPoint {
    TextPoint { block: "p".into(), offset, affinity: Affinity::After }
}
fn range(a: u32, b: u32) -> Selection {
    Selection::TextRange { anchor: point(a), focus: point(b) }
}
fn caret(a: &mut RichReplica, offset: u32) -> Result {
    a.set_selection(Some(&range(offset, offset)))?;
    Ok(())
}
fn caption_caret(a: &mut RichReplica, offset: u32) -> Result {
    let point = TextPoint { block: "caption".into(), offset, affinity: Affinity::After };
    a.set_selection(Some(&Selection::TextRange { anchor: point.clone(), focus: point }))?;
    Ok(())
}
fn typing(a: &mut RichReplica, text: &str, clock: u64) -> Result {
    assert!(a.insert_typing_text_guarded(&a.observe()?, text, clock)?);
    Ok(())
}
fn enable(a: &mut RichReplica) -> Result {
    assert!(a.enable_typing_history_guarded(&a.observe()?)?);
    Ok(())
}
fn insert(block: &str, offset: u32, text: &str) -> Command {
    Command::InsertText(InsertText { block: block.into(), offset, text: text.into() })
}
fn delete(block: &str, offset: u32, length: u32) -> Command {
    Command::DeleteText(DeleteText { block: block.into(), offset, length })
}
fn find<'a>(node: &'a Value, block: &str) -> Option<&'a Value> {
    if node.pointer("/properties/breditor~1block-id").and_then(Value::as_str) == Some(block) {
        return Some(node);
    }
    node["children"].as_array()?.iter().find_map(|node| find(node, block))
}
fn text(owner: &RichReplica, block: &str) -> Result<String> {
    let value: Value = serde_json::from_str(owner.document_json())?;
    Ok(find(&value["root"], block).ok_or("block")?["children"]
        .as_array()
        .ok_or("runs")?
        .iter()
        .filter_map(|run| run["text"].as_str())
        .collect())
}

#[test]
fn native_groups_retain_per_input_records_and_exact_recovered_future_history() -> Result {
    for version in [1, 2] {
        let (profile, mut a, _) = setup(version)?;
        caret(&mut a, 1)?;
        let original = a.document_json().to_owned();
        let old = a.checkpoint()?;
        let frozen = a.observe()?;
        assert!(a.insert_typing_text_guarded(&frozen, "X", 0).is_err());
        assert_eq!(a.checkpoint()?, old);
        enable(&mut a)?;
        assert!(
            serde_json::from_str::<Value>(frozen.view_json())?.get("historyGrouping").is_none()
        );
        assert!(a.check(&frozen).is_err());
        for (clock, value) in [(1, "A"), (2, "🙂"), (3, "C")] {
            typing(&mut a, value, clock)?;
        }
        assert_eq!(text(&a, "p")?, "aA🙂C🙂b");
        assert_eq!((a.undo_count(), a.redo_count(), a.history_step_count()), (1, 0, 3));
        let saved = a.typing_checkpoint()?;
        let value: Value = serde_json::from_str(&saved)?;
        assert_eq!(value["joins"], json!([1, 2]));
        assert_eq!(value["journal"]["entries"].as_array().ok_or("entries")?.len(), 3);
        assert!(a.checkpoint().is_err());
        assert!(profile.restore("room", &saved).is_err());
        assert!(profile.restore("room", &value["journal"].to_string()).is_err());
        assert!(profile.restore_typing("room", &old).is_err());
        let mut restored = profile.restore_typing("room", &saved)?;
        assert_eq!(restored.typing_checkpoint()?, saved);
        for redo in [false, true, false, true] {
            assert_eq!(
                if redo { a.redo()? } else { a.undo()? },
                if redo { restored.redo()? } else { restored.undo()? }
            );
            assert_eq!(a.typing_checkpoint()?, restored.typing_checkpoint()?);
            assert_eq!(a.view_json()?, restored.view_json()?);
            assert_eq!(a.document_json() == original, !redo);
        }
        assert_eq!(a.selection()?, Some(range(5, 5)));
    }
    Ok(())
}

#[test]
fn partially_invisible_prefix_cannot_spill_grouped_undo_into_an_older_explicit_edit() -> Result {
    for version in [1, 2] {
        let (profile, mut a, mut b) = setup(version)?;
        a.apply(vec![insert("p", 0, "Older ")])?;
        enable(&mut a)?;
        caption_caret(&mut a, 1)?;
        typing(&mut a, "A", 1)?;
        typing(&mut a, "B", 2)?;
        b.receive(a.updates()?)?;
        b.apply(vec![delete("caption", 1, 1), insert("caption", 0, "Peer ")])?;
        a.receive(b.updates()?)?;
        let mut restored = profile.restore_typing("room", &a.typing_checkpoint()?)?;
        assert!(a.undo()?);
        assert!(restored.undo()?);
        assert_eq!(text(&a, "caption")?, "Peer xy🙂");
        let before = TextPoint { block: "caption".into(), offset: 6, affinity: Affinity::After };
        assert_eq!(
            a.selection()?,
            Some(Selection::TextRange { anchor: before.clone(), focus: before })
        );
        assert!(text(&a, "p")?.starts_with("Older "));
        assert_eq!((a.undo_count(), a.redo_count()), (1, 1));
        assert_eq!(a.typing_checkpoint()?, restored.typing_checkpoint()?);
        for redo in [true, false, true] {
            assert_eq!(
                if redo { a.redo()? } else { a.undo()? },
                if redo { restored.redo()? } else { restored.undo()? }
            );
            assert_eq!(a.typing_checkpoint()?, restored.typing_checkpoint()?);
            assert!(text(&a, "p")?.starts_with("Older "));
            assert!(text(&a, "caption")?.starts_with("Peer "));
            let point = TextPoint {
                block: "caption".into(),
                offset: if redo { 7 } else { 6 },
                affinity: Affinity::After,
            };
            assert_eq!(
                a.selection()?,
                Some(Selection::TextRange { anchor: point.clone(), focus: point })
            );
        }
    }
    Ok(())
}

#[test]
fn fully_invisible_group_preserves_native_skip_policy_and_false_publication_semantics() -> Result {
    for version in [1, 2] {
        for older in [false, true] {
            let (profile, mut a, mut b) = setup(version)?;
            if older {
                a.apply(vec![insert("p", 0, "Older ")])?;
            }
            enable(&mut a)?;
            caption_caret(&mut a, 1)?;
            typing(&mut a, "A", 1)?;
            typing(&mut a, "B", 2)?;
            b.receive(a.updates()?)?;
            b.apply(vec![delete("caption", 1, 2)])?;
            a.receive(b.updates()?)?;
            let before = a.observe()?;
            let mut restored = profile.restore_typing("room", &a.typing_checkpoint()?)?;
            assert_eq!(a.undo_guarded(&before)?, older);
            assert_eq!(restored.undo()?, older);
            assert!(a.check(&before).is_err());
            assert_eq!((a.undo_count(), a.redo_count()), (0, usize::from(older)));
            assert_eq!(a.typing_checkpoint()?, restored.typing_checkpoint()?);
            assert_eq!(text(&a, "caption")?, "xy🙂");
            assert!(!text(&a, "p")?.starts_with("Older "));
        }
    }
    Ok(())
}

#[test]
fn adjacent_directional_deletions_restore_actual_carets_and_reject_half_scalars_atomically()
-> Result {
    for version in [1, 2] {
        let (_, mut a, _) = setup(version)?;
        enable(&mut a)?;
        caret(&mut a, 1)?;
        typing(&mut a, "ABC", 1)?;
        for target in [range(4, 3), range(3, 2)] {
            assert!(a.delete_typing_range_guarded(
                &a.observe()?,
                &target,
                RichTypingDeleteDirection::Backward,
                2
            )?);
        }
        assert_eq!(text(&a, "p")?, "aA🙂b");
        assert_eq!(a.undo_count(), 2);
        assert!(a.undo()?);
        assert_eq!(a.selection()?, Some(range(4, 4)));
        assert_eq!(text(&a, "p")?, "aABC🙂b");
        let before = a.typing_checkpoint()?;
        let observation = a.observe()?;
        for (target, direction) in [
            (range(4, 5), RichTypingDeleteDirection::Forward),
            (range(1, 2), RichTypingDeleteDirection::Backward),
        ] {
            assert!(a.delete_typing_range_guarded(&observation, &target, direction, 3).is_err());
            assert_eq!(a.typing_checkpoint()?, before);
            a.check(&observation)?;
        }
        assert!(a.delete_typing_range_guarded(
            &a.observe()?,
            &range(4, 6),
            RichTypingDeleteDirection::Forward,
            3
        )?);
        assert!(a.delete_typing_range_guarded(
            &a.observe()?,
            &range(5, 4),
            RichTypingDeleteDirection::Forward,
            4
        )?);
        assert_eq!(text(&a, "p")?, "aABC");
        assert_eq!(a.undo_count(), 2);
    }
    Ok(())
}

#[test]
fn time_noops_close_policy_and_recovery_are_real_native_group_boundaries() -> Result {
    for version in [1, 2] {
        let (profile, mut a, _) = setup(version)?;
        enable(&mut a)?;
        caret(&mut a, 1)?;
        let clock = 9_007_199_254_740_993;
        typing(&mut a, "A", clock)?;
        assert!(!a.insert_typing_text_guarded(&a.observe()?, "", clock + 50_000)?);
        assert!(!a.set_selection(Some(&range(2, 2)))?);
        typing(&mut a, "B", clock + 750)?;
        assert_eq!(a.undo_count(), 1);
        typing(&mut a, "C", clock + 1501)?;
        assert_eq!(a.undo_count(), 2);
        let old = a.observe()?;
        assert!(a.close_typing_group_guarded(&old)?);
        assert!(a.check(&old).is_err());
        assert!(!a.close_typing_group_guarded(&a.observe()?)?);
        typing(&mut a, "D", clock + 1502)?;
        assert_eq!(a.undo_count(), 3);
        let saved = a.typing_checkpoint()?;
        let mut restored = profile.restore_typing("room", &saved)?;
        typing(&mut restored, "E", clock + 1503)?;
        assert_eq!(restored.undo_count(), 4);
        assert!(a.set_read_only_guarded(&a.observe()?, true)?);
        let locked = a.typing_checkpoint()?;
        assert!(matches!(
            a.insert_typing_text_guarded(&a.observe()?, "No", 0),
            Err(Error::ReadOnly)
        ));
        assert_eq!(a.typing_checkpoint()?, locked);
        let recovered = profile.restore_typing("room", &locked)?;
        assert!(!recovered.is_read_only());
        assert!(a.set_read_only_guarded(&a.observe()?, false)?);
        typing(&mut a, "E", 0)?;
        assert_eq!(a.undo_count(), 4);
    }
    Ok(())
}

#[test]
fn separate_recovery_rejects_bad_bindings_partitions_records_and_budgets() -> Result {
    for version in [1, 2] {
        let (profile, mut a, _) = setup(version)?;
        enable(&mut a)?;
        caret(&mut a, 1)?;
        typing(&mut a, "A", 1)?;
        typing(&mut a, "B", 2)?;
        let saved = a.typing_checkpoint()?;
        let base: Value = serde_json::from_str(&saved)?;
        for (pointer, value) in [
            ("/formatVersion", json!(2)),
            ("/modelVersion", json!(99)),
            ("/journalVersion", json!(99)),
            ("/joins", json!([0])),
            ("/joins", json!([1, 1])),
            ("/joins", json!([999])),
            ("/joins", json!(["1"])),
            ("/journal/format", json!("breditor/rich-replica-journal")),
        ] {
            let mut bad = base.clone();
            *bad.pointer_mut(pointer).ok_or("pointer")? = value;
            assert!(profile.restore_typing("room", &bad.to_string()).is_err());
        }
        assert!(profile.restore_typing("other-room", &saved).is_err());
        assert!(
            profile
                .restore_typing(
                    "room",
                    &saved.replacen(
                        "\"formatVersion\":1",
                        "\"formatVersion\":1,\"formatVersion\":1",
                        1
                    )
                )
                .is_err()
        );
        let mut unknown = base.clone();
        unknown["unknown"] = json!(true);
        assert!(profile.restore_typing("room", &unknown.to_string()).is_err());
        let mut oversized = base;
        oversized["joins"] = json!(vec![1; 1001]);
        assert!(profile.restore_typing("room", &oversized.to_string()).is_err());
        assert!(profile.restore_typing("room", &" ".repeat(16 * 1024 * 1024 + 1)).is_err());
        assert_eq!(a.typing_checkpoint()?, saved);
    }
    Ok(())
}

#[test]
fn existing_explicit_undo_redo_and_per_input_forward_records_keep_their_original_meaning() -> Result
{
    for version in [1, 2] {
        let (profile, mut a, _) = setup(version)?;
        a.apply(vec![insert("caption", 0, "Older ")])?;
        a.apply(vec![insert("caption", 0, "Second ")])?;
        assert!(a.undo()?);
        let original = a.checkpoint()?;
        let mut explicit = profile.restore("room", &original)?;
        let causal = a.causal_version();
        enable(&mut a)?;
        assert_eq!(a.causal_version(), causal);
        assert_eq!((a.undo_count(), a.redo_count(), a.history_step_count()), (1, 1, 2));
        assert!(a.redo()?);
        assert!(explicit.redo()?);
        caret(&mut a, 1)?;
        caret(&mut explicit, 1)?;
        for (clock, value) in [(1, "A"), (2, "B"), (3, "C")] {
            typing(&mut a, value, clock)?;
            assert!(explicit.insert_plain_text(value)?);
        }
        assert_eq!(a.document_json(), explicit.document_json());
        assert_eq!(a.causal_version(), explicit.causal_version());
        let grouped: Value = serde_json::from_str(&a.typing_checkpoint()?)?;
        let original: Value = serde_json::from_str(&explicit.checkpoint()?)?;
        assert_eq!(grouped["journal"]["entries"], original["entries"]);
        assert_eq!((a.undo_count(), explicit.undo_count()), (3, 5));
        assert!(a.undo()?);
        assert_eq!(text(&a, "p")?, "a🙂b");
        assert!(text(&a, "caption")?.starts_with("Second Older "));
    }
    Ok(())
}

#[test]
fn original_step_ceiling_bounds_native_spans_and_recovery_rejects_a_sixty_fifth_join() -> Result {
    let (profile, mut a, _) = setup(1)?;
    enable(&mut a)?;
    caption_caret(&mut a, 1)?;
    for clock in 0..65 {
        typing(&mut a, "X", clock)?;
    }
    assert_eq!((a.undo_count(), a.history_step_count()), (2, 65));
    let saved = a.typing_checkpoint()?;
    let mut bad: Value = serde_json::from_str(&saved)?;
    assert_eq!(bad["joins"].as_array().ok_or("joins")?.len(), 63);
    bad["joins"].as_array_mut().ok_or("joins")?.push(json!(64));
    assert!(profile.restore_typing("room", &bad.to_string()).is_err());
    let mut restored = profile.restore_typing("room", &saved)?;
    for redo in [false, false, true, true] {
        assert_eq!(
            if redo { a.redo()? } else { a.undo()? },
            if redo { restored.redo()? } else { restored.undo()? }
        );
        assert_eq!(a.typing_checkpoint()?, restored.typing_checkpoint()?);
    }
    Ok(())
}

#[test]
fn line_separators_and_format_policy_are_native_burst_boundaries() -> Result {
    for version in [1, 2] {
        let (profile, mut a, _) = setup(version)?;
        enable(&mut a)?;
        caption_caret(&mut a, 1)?;
        for (clock, value) in [(1, "A"), (2, "B"), (3, "\n"), (4, "C"), (5, "D")] {
            typing(&mut a, value, clock)?;
        }
        assert_eq!((a.undo_count(), a.history_step_count()), (3, 5));
        assert_eq!(text(&a, "caption")?, "xAB\nCDy🙂");
        a.set_pending_formats(Some(&[json!({"type":"breditor/strong","properties":{}})]))?;
        typing(&mut a, "E", 6)?;
        typing(&mut a, "F", 7)?;
        assert_eq!(a.undo_count(), 4);
        let mut restored = profile.restore_typing("room", &a.typing_checkpoint()?)?;
        assert!(a.undo()?);
        assert!(restored.undo()?);
        assert_eq!(a.typing_checkpoint()?, restored.typing_checkpoint()?);
        assert_eq!(text(&a, "caption")?, "xAB\nCDy🙂");
        assert!(a.undo()?);
        assert_eq!(text(&a, "caption")?, "xAB\ny🙂");
        assert!(a.undo()?);
        assert_eq!(text(&a, "caption")?, "xABy🙂");
        assert!(a.undo()?);
        assert_eq!(text(&a, "caption")?, "xy🙂");
    }
    Ok(())
}

#[test]
fn remote_admission_and_explicit_edits_close_continuation_but_duplicate_frames_do_not() -> Result {
    for version in [1, 2] {
        let (profile, mut a, mut b) = setup(version)?;
        enable(&mut a)?;
        caption_caret(&mut a, 1)?;
        typing(&mut a, "A", 1)?;
        b.apply(vec![insert("p", 0, "Peer ")])?;
        let frame = b.update_frame()?;
        a.receive_frame(&frame)?;
        typing(&mut a, "B", 2)?;
        assert_eq!(a.undo_count(), 2);
        let before = a.observe()?;
        a.receive_frame(&frame)?;
        a.check(&before)?;
        typing(&mut a, "C", 3)?;
        assert_eq!(a.undo_count(), 2);
        assert!(a.insert_plain_text("Explicit")?);
        typing(&mut a, "D", 4)?;
        assert_eq!(a.undo_count(), 4);
        let mut restored = profile.restore_typing("room", &a.typing_checkpoint()?)?;
        for _ in 0..4 {
            assert!(a.undo()?);
            assert!(restored.undo()?);
            assert_eq!(a.typing_checkpoint()?, restored.typing_checkpoint()?);
            assert!(text(&a, "p")?.starts_with("Peer "));
        }
        assert_eq!(text(&a, "caption")?, "xy🙂");
    }
    Ok(())
}

#[test]
fn late_revision_failures_preserve_content_groups_ui_and_current_observation() -> Result {
    for version in [1, 2] {
        let (profile, mut a, _) = setup(version)?;
        enable(&mut a)?;
        caption_caret(&mut a, 1)?;
        typing(&mut a, "A", 1)?;
        typing(&mut a, "B", 2)?;
        for redo in [false, true] {
            let mut wire: Value = serde_json::from_str(&a.typing_checkpoint()?)?;
            wire["journal"]["publication"] = json!(u64::MAX.to_string());
            let mut limited = profile.restore_typing("room", &wire.to_string())?;
            let before = limited.typing_checkpoint()?;
            let observation = limited.observe()?;
            assert!(limited.insert_typing_text_guarded(&observation, "No", 3).is_err());
            assert!(
                if redo {
                    limited.redo_guarded(&observation)
                } else {
                    limited.undo_guarded(&observation)
                }
                .is_err()
            );
            assert_eq!(limited.typing_checkpoint()?, before);
            limited.check(&observation)?;
            if !redo {
                assert!(a.undo()?);
            }
        }
        let mut wire: Value = serde_json::from_str(&a.typing_checkpoint()?)?;
        wire["journal"]["publication"] = json!((u64::MAX - 1).to_string());
        let mut limited = profile.restore_typing("room", &wire.to_string())?;
        typing(&mut limited, "Last", 1)?;
        let before = limited.typing_checkpoint()?;
        let observation = limited.observe()?;
        assert!(limited.close_typing_group_guarded(&observation).is_err());
        assert_eq!(limited.typing_checkpoint()?, before);
        limited.check(&observation)?;
    }
    Ok(())
}

#[test]
fn code_and_nested_task_text_keep_native_grouped_history_across_structural_contexts() -> Result {
    let (profile, seed, _) = setup(2)?;
    let mut document: Value = serde_json::from_str(seed.document_json())?;
    let code = json!({"kind":"element","type":"breditor/code-block","entityId":null,"properties":{"breditor/block-id":"code","breditor/language":"rust"},"children":[{"kind":"text","text":"seed","formats":[]}]});
    let task = json!({"kind":"element","type":"breditor/task-list","entityId":null,"properties":{"breditor/block-id":"tasks"},"children":[{"kind":"element","type":"breditor/task-item","entityId":null,"properties":{"breditor/block-id":"task","breditor/checked":false},"children":[{"kind":"element","type":"breditor/paragraph","entityId":null,"properties":{"breditor/block-id":"task-head"},"children":[{"kind":"text","text":"Do it","formats":[]}]},{"kind":"element","type":"breditor/blockquote","entityId":null,"properties":{"breditor/block-id":"quote"},"children":[{"kind":"element","type":"breditor/paragraph","entityId":null,"properties":{"breditor/block-id":"quote-head"},"children":[{"kind":"text","text":"Details","formats":[]}]}]}]}]});
    document["root"]["children"].as_array_mut().ok_or("children")?.extend([code, task]);
    let mut a = profile.create(&document.to_string(), "303".into())?;
    let original = a.document_json().to_owned();
    enable(&mut a)?;
    for block in ["code", "task-head", "quote-head"] {
        let point = TextPoint { block: block.into(), offset: 0, affinity: Affinity::After };
        a.set_selection(Some(&Selection::TextRange { anchor: point.clone(), focus: point }))?;
        typing(&mut a, "X", 1)?;
        typing(&mut a, "Y", 2)?;
    }
    assert_eq!((a.undo_count(), a.history_step_count()), (3, 6));
    let mut restored = profile.restore_typing("room", &a.typing_checkpoint()?)?;
    for redo in [false, false, false, true, true, true] {
        assert_eq!(
            if redo { a.redo()? } else { a.undo()? },
            if redo { restored.redo()? } else { restored.undo()? }
        );
        assert_eq!(a.typing_checkpoint()?, restored.typing_checkpoint()?);
        if a.undo_count() == 0 {
            assert_eq!(a.document_json(), original);
        }
    }
    for block in ["code", "task-head", "quote-head"] {
        assert!(text(&a, block)?.starts_with("XY"));
    }
    let point = TextPoint { block: "code".into(), offset: 2, affinity: Affinity::After };
    a.set_selection(Some(&Selection::TextRange { anchor: point.clone(), focus: point }))?;
    assert!(a.insert_hard_break_guarded(&a.observe()?)?);
    typing(&mut a, "Z", 3)?;
    assert_eq!(a.undo_count(), 5);
    assert_eq!(text(&a, "code")?, "XY\nZseed");
    Ok(())
}

#[test]
fn prepared_writer_admission_retains_explicit_grouped_recovery_and_native_burst_fences() -> Result {
    use breditor_collaboration::rich_replica::WriterGroupPreparation;
    for version in [1, 2] {
        let (profile, mut a, mut b) = setup(version)?;
        enable(&mut a)?;
        caption_caret(&mut a, 1)?;
        typing(&mut a, "A", 1)?;
        b.apply(vec![insert("p", 0, "Peer ")])?;
        let batch: Value = serde_json::from_str(&b.writer_groups_guarded(&b.observe()?, "0")?)?;
        let group = batch["groups"][0].as_str().ok_or("writer group")?;
        let WriterGroupPreparation::Prepared(prepared) = a.prepare_writer_group("202", group)?
        else {
            return Err("prepared group".into());
        };
        assert!(prepared.checkpoint().is_err());
        let saved = prepared.typing_checkpoint()?;
        assert!(profile.restore("room", &saved).is_err());
        let recovered = profile.restore_typing("room", &saved)?;
        assert!(text(&recovered, "p")?.starts_with("Peer "));
        a.commit_writer_group(*prepared)?;
        assert_eq!(a.typing_checkpoint()?, saved);
        typing(&mut a, "B", 2)?;
        assert_eq!(a.undo_count(), 2);
        let observation = a.observe()?;
        assert!(matches!(
            a.prepare_writer_group("202", group)?,
            WriterGroupPreparation::Duplicate(_)
        ));
        a.check(&observation)?;
        typing(&mut a, "C", 3)?;
        assert_eq!(a.undo_count(), 2);
        let mut restored = profile.restore_typing("room", &a.typing_checkpoint()?)?;
        for _ in 0..2 {
            assert!(a.undo()?);
            assert!(restored.undo()?);
            assert_eq!(a.typing_checkpoint()?, restored.typing_checkpoint()?);
        }
        assert_eq!(text(&a, "caption")?, "xy🙂");
        assert!(text(&a, "p")?.starts_with("Peer "));
        let from = b.writer_clock("101")?.through;
        let outgoing: Value =
            serde_json::from_str(&a.writer_groups_guarded(&a.observe()?, &from)?)?;
        let groups = outgoing["groups"].as_array().ok_or("outgoing groups")?;
        // Three original input publications, then two native Undo units.
        assert_eq!(groups.len(), 5);
        for group in groups {
            let WriterGroupPreparation::Prepared(prepared) =
                b.prepare_writer_group("101", group.as_str().ok_or("group")?)?
            else {
                return Err("outgoing prepared group".into());
            };
            assert!(prepared.typing_checkpoint().is_err());
            assert!(profile.restore("room", &prepared.checkpoint()?).is_ok());
            b.commit_writer_group(*prepared)?;
        }
        assert_eq!(a.document_json(), b.document_json());
        assert_eq!(a.writer_clock("101")?, b.writer_clock("101")?);
        assert_eq!((b.undo_count(), b.redo_count()), (1, 0));
    }
    Ok(())
}

#[test]
fn original_oversized_journal_keeps_its_original_limit_error() -> Result {
    let (profile, a, _) = setup(1)?;
    let mut value: Value = serde_json::from_str(&a.checkpoint()?)?;
    value["entries"] = json!(vec![json!({"kind":"remote","bytes":[]}); 1001]);
    assert!(matches!(
        profile.restore("room", &value.to_string()),
        Err(Error::Limit("rich journal entries"))
    ));
    Ok(())
}

//! Document scope is local UI; owned root edits retain exact selective histories and peer content.
#[path = "../../breditor-core/tests/support/coverage_fixture.rs"]
mod fixture;
use breditor_collaboration::{
    anchor::Affinity,
    rich_replica::{
        Command, RichReplica, SharedRichProfile,
        actions::{InsertBlocks, InsertText},
        selection::{Selection, TextPoint},
    },
};
use serde_json::{Value, json};
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;
fn setup(hidden: bool) -> Result<(SharedRichProfile, RichReplica)> {
    let p=SharedRichProfile::from_standard_configuration_json_v3(&json!({"format":"breditor/shared-rich-profile","formatVersion":3,"schema":{"name":"example/document-shared","version":1},"extensions":[]}).to_string())?;
    let mut root = fixture::root();
    if hidden {
        root["children"]
            .as_array_mut()
            .ok_or("children")?
            .retain(|n| n["properties"]["breditor/block-id"] == "hidden");
    }
    let input=json!({"format":"breditor/document","formatVersion":2,"schema":{"name":"example/document-shared","version":1},"schemaFingerprint":p.schema().fingerprint().to_string(),"root":root}).to_string();
    let a = p.create(&input, "101".into())?;
    Ok((p, a))
}
fn save(a: &RichReplica) -> Result<String> {
    Ok(if a.typing_history_enabled() {
        a.document_typing_checkpoint()?
    } else {
        a.document_checkpoint()?
    })
}
fn restore(p: &SharedRichProfile, a: &RichReplica, bytes: &str) -> Result<RichReplica> {
    Ok(if a.typing_history_enabled() {
        p.restore_document_typing("room", bytes)?
    } else {
        p.restore_document("room", bytes)?
    })
}
fn enable(a: &mut RichReplica, natural: bool) -> Result {
    a.enable_document_selection_guarded(&a.observe()?)?;
    if natural {
        a.enable_typing_history_guarded(&a.observe_document()?)?;
    }
    Ok(())
}
fn replace(a: &mut RichReplica, paragraph: &str, text: &str) -> Result {
    assert!(a.replace_document_plain_text_json_guarded(
        &a.observe_document()?,
        &json!({"paragraph":paragraph,"text":text}).to_string()
    )?);
    Ok(())
}
fn peer(p: &SharedRichProfile, a: &RichReplica) -> Result<RichReplica> {
    Ok(p.join_frame("room".into(), "202".into(), &a.update_frame()?)?)
}
fn paragraph(block: &str, text: &str) -> Value {
    json!({"kind":"element","type":"breditor/paragraph","entityId":null,"properties":{"breditor/block-id":block},"children":[{"kind":"text","text":text,"formats":[]}]})
}

#[test]
fn document_first_key_joins_only_following_caret_input_and_replays_its_exact_partition() -> Result {
    let (p, mut a) = setup(false)?;
    enable(&mut a, true)?;
    let caret = TextPoint { block: "q1".into(), offset: 0, affinity: Affinity::After };
    a.set_selection(Some(&Selection::TextRange { anchor: caret.clone(), focus: caret }))?;
    a.insert_typing_text_guarded(&a.observe_document()?, "A", 1)?;
    a.insert_typing_text_guarded(&a.observe_document()?, "B", 2)?;
    assert_eq!((a.undo_count(), a.history_step_count()), (1, 2));
    let before = a.document_json().to_owned();
    a.select_document_guarded(&a.observe_document()?)?;
    let exact = save(&a)?;
    let request = |text: &str, clock: Value| {
        json!({"paragraph":"whole","text":text,"clockMs":clock}).to_string()
    };
    assert!(!a.replace_document_typing_text_json_guarded(
        &a.observe_document()?,
        &request("", json!("3"))
    )?);
    assert_eq!(save(&a)?, exact);
    for clock in [json!(3), json!("03"), json!("+3"), json!("18446744073709551616")] {
        assert!(
            a.replace_document_typing_text_json_guarded(
                &a.observe_document()?,
                &request("Q", clock)
            )
            .is_err()
        );
        assert_eq!(save(&a)?, exact);
    }
    a.replace_document_typing_text_json_guarded(&a.observe_document()?, &request("Q", json!("3")))?;
    a.insert_typing_text_guarded(&a.observe_document()?, "🙂", 4)?;
    a.insert_typing_text_guarded(&a.observe_document()?, "R", 5)?;
    assert_eq!((a.undo_count(), a.history_step_count()), (2, 5));
    assert_eq!(text(a.document_json(), "whole")?, Some("Q🙂R".into()));
    let bytes = save(&a)?;
    let mut b = restore(&p, &a, &bytes)?;
    assert_eq!(save(&b)?, bytes);
    for undo in [true, false, true, false] {
        if undo {
            a.undo()?;
            b.undo()?;
            assert!(a.document_selected());
            assert_eq!(a.document_json(), before);
        } else {
            a.redo()?;
            b.redo()?;
        }
        assert_eq!(save(&a)?, save(&b)?);
    }
    b.insert_typing_text_guarded(&b.observe_document()?, "!", 6)?;
    assert_eq!(b.undo_count(), 3, "recovery closes the active live burst");
    Ok(())
}
fn text(document: &str, block: &str) -> Result<Option<String>> {
    fn find(node: &Value, id: &str) -> Option<String> {
        if node["properties"]["breditor/block-id"] == id {
            return Some(
                node["children"].as_array()?.iter().filter_map(|n| n["text"].as_str()).collect(),
            );
        }
        node["children"].as_array()?.iter().find_map(|n| find(n, id))
    }
    Ok(find(&serde_json::from_str::<Value>(document)?["root"], block))
}

#[test]
fn whole_scope_copy_plain_replacement_and_recovery_include_hidden_no_text_sources() -> Result {
    for natural in [false, true] {
        for hidden in [false, true] {
            for inserted in ["", "Q🙂"] {
                let (p, mut a) = setup(hidden)?;
                let source = a.document_json().to_owned();
                let causal = a.causal_version();
                enable(&mut a, natural)?;
                assert_eq!(a.causal_version(), causal);
                assert!(a.general_ranges_enabled());
                assert!(a.document_selection_enabled());
                assert!(a.select_document_guarded(&a.observe_document()?)?);
                assert!(a.document_selected());
                assert_eq!(a.undo_count(), 0);
                assert!(a.selection().is_err());
                assert!(a.observe().is_err());
                assert!(a.view_json().is_err());
                let view: Value = serde_json::from_str(&a.document_view_json()?)?;
                assert_eq!(view["format"], "breditor/shared-document-view");
                assert_eq!(view["selection"], json!({"kind":"document"}));
                let copy =
                    a.copy_document_clipboard_guarded(&a.observe_document()?)?.ok_or("copy")?;
                let clip: Value = serde_json::from_str(&copy.rich_json)?;
                assert_eq!(clip["kind"], "flow");
                assert!(copy.rich_json.contains("hidden"));
                let exact = save(&a)?;
                assert!(!a.select_document_guarded(&a.observe_document()?)?);
                assert_eq!(save(&a)?, exact);
                replace(&mut a, "whole", inserted)?;
                assert_eq!(a.undo_count(), 1);
                assert!(!a.document_selected());
                assert_eq!(text(a.document_json(), "whole")?, Some(inserted.into()));
                let after = a.document_json().to_owned();
                assert!(a.checkpoint().is_err());
                assert!(a.general_checkpoint().is_err());
                assert!(a.typing_checkpoint().is_err());
                assert!(a.general_typing_checkpoint().is_err());
                let bytes = save(&a)?;
                assert!(p.restore("room", &bytes).is_err());
                assert!(p.restore_general("room", &bytes).is_err());
                assert!(p.restore_typing("room", &bytes).is_err());
                assert!(p.restore_general_typing("room", &bytes).is_err());
                let mut b = restore(&p, &a, &bytes)?;
                assert_eq!(save(&b)?, bytes);
                for undo in [true, false, true, false] {
                    if undo {
                        assert!(a.undo()?);
                        assert!(b.undo()?);
                        assert!(a.document_selected());
                        assert_eq!(a.document_json(), source);
                    } else {
                        assert!(a.redo()?);
                        assert!(b.redo()?);
                        assert_eq!(a.document_json(), after);
                    }
                    assert_eq!(save(&a)?, save(&b)?);
                }
            }
        }
    }
    Ok(())
}

#[test]
fn offline_root_births_and_edits_in_deleted_source_survive_owned_replacement_undo_and_recovery()
-> Result {
    let (p, mut a) = setup(false)?;
    let mut b = peer(&p, &a)?;
    enable(&mut a, false)?;
    a.select_document_guarded(&a.observe_document()?)?;
    b.apply(vec![
        Command::InsertBlocks(InsertBlocks {
            parent: None,
            before: None,
            nodes: vec![paragraph("peer-root", "OFFLINE")],
        }),
        Command::InsertText(InsertText { block: "q1".into(), offset: 1, text: "PEER".into() }),
    ])?;
    replace(&mut a, "whole", "Q🙂")?;
    a.receive_frame(&b.update_frame()?)?;
    b.receive_frame(&a.update_frame()?)?;
    assert_eq!(a.document_json(), b.document_json());
    assert_eq!(text(a.document_json(), "peer-root")?, Some("OFFLINE".into()));
    assert_eq!(text(a.document_json(), "q1")?, None);
    let bytes = save(&a)?;
    let mut recovered = restore(&p, &a, &bytes)?;
    assert_eq!(save(&recovered)?, bytes);
    // The original peer has no document-selection metadata or command; its exact original recovery works.
    let peer_bytes = b.checkpoint()?;
    let mut peer_recovered = p.restore("room", &peer_bytes)?;
    assert_eq!(peer_recovered.checkpoint()?, peer_bytes);
    for undo in [true, false, true, false] {
        if undo {
            a.undo()?;
            recovered.undo()?;
            assert!(a.document_selected());
            assert!(text(a.document_json(), "q1")?.ok_or("restored quote")?.contains("PEER"));
        } else {
            a.redo()?;
            recovered.redo()?;
            assert_eq!(text(a.document_json(), "q1")?, None);
        }
        assert_eq!(text(a.document_json(), "peer-root")?, Some("OFFLINE".into()));
        assert_eq!(save(&a)?, save(&recovered)?);
        let frame = a.update_frame()?;
        b.receive_frame(&frame)?;
        peer_recovered.receive_frame(&frame)?;
        assert_eq!(a.document_json(), b.document_json());
        assert_eq!(b.checkpoint()?, peer_recovered.checkpoint()?);
    }
    Ok(())
}

#[test]
fn peer_text_in_fresh_replacement_remains_exactly_recoverable_across_birth_undo() -> Result {
    let (p, mut a) = setup(false)?;
    let mut b = peer(&p, &a)?;
    enable(&mut a, true)?;
    a.select_document_guarded(&a.observe_document()?)?;
    replace(&mut a, "whole", "Q")?;
    b.receive_frame(&a.update_frame()?)?;
    b.apply(vec![Command::InsertText(InsertText {
        block: "whole".into(),
        offset: 1,
        text: "PEER".into(),
    })])?;
    a.receive_frame(&b.update_frame()?)?;
    let bytes = save(&a)?;
    let mut recovered = restore(&p, &a, &bytes)?;
    for undo in [true, false, true, false] {
        if undo {
            a.undo()?;
            recovered.undo()?;
            assert_eq!(text(a.document_json(), "whole")?, None);
            let hidden = save(&a)?;
            let mut from_hidden = restore(&p, &a, &hidden)?;
            assert_eq!(save(&from_hidden)?, hidden);
            from_hidden.redo()?;
            assert!(
                text(from_hidden.document_json(), "whole")?
                    .ok_or("restored peer paragraph")?
                    .contains("PEER")
            );
        } else {
            a.redo()?;
            recovered.redo()?;
            assert!(text(a.document_json(), "whole")?.ok_or("peer paragraph")?.contains("PEER"));
        }
        assert_eq!(save(&a)?, save(&recovered)?);
    }
    Ok(())
}

#[test]
fn old_families_scope_records_and_requests_stay_closed_and_guarded() -> Result {
    let (p, mut a) = setup(false)?;
    let (_, foreign) = setup(false)?;
    let original = a.checkpoint()?;
    let original_guard = a.observe()?;
    assert!(a.select_document_guarded(&original_guard).is_err());
    assert_eq!(a.checkpoint()?, original);
    enable(&mut a, false)?;
    let enabled = save(&a)?;
    assert!(a.select_document_guarded(&foreign.observe()?).is_err());
    assert_eq!(save(&a)?, enabled);
    a.select_document_guarded(&a.observe_document()?)?;
    let exact = save(&a)?;
    assert!(
        a.replace_document_typing_text_json_guarded(
            &a.observe_document()?,
            &json!({"paragraph":"fresh","text":"Q","clockMs":"1"}).to_string()
        )
        .is_err()
    );
    assert_eq!(save(&a)?, exact);
    assert!(a.replace_document_plain_text_json_guarded(&original_guard, "bad").is_err());
    for input in [
        "bad".into(),
        json!({"paragraph":"q1","text":"X"}).to_string(),
        json!({"paragraph":"fresh","text":"X","extra":true}).to_string(),
        "{\"paragraph\":\"fresh\",\"text\":\"X\",\"text\":\"Y\"}".into(),
    ] {
        assert!(
            a.replace_document_plain_text_json_guarded(&a.observe_document()?, &input).is_err()
        );
        assert_eq!(save(&a)?, exact);
    }
    for bad in [
        exact.replace("\"version\":1}", "\"version\":1,\"extra\":true}"),
        exact.replace("\"kind\":\"document\",\"version\":1", "\"kind\":\"document\",\"version\":2"),
    ] {
        assert!(p.restore_document("room", &bad).is_err());
    }
    let mut relocated: Value = serde_json::from_str(&exact)?;
    relocated["ui"]["outcome"] = json!({"kind":"relocated"});
    assert!(p.restore_document("room", &relocated.to_string()).is_err());
    let mislabeled = exact
        .replace("breditor/rich-replica-document-journal", "breditor/rich-replica-general-journal");
    assert!(p.restore_general("room", &mislabeled).is_err());
    a.set_read_only_guarded(&a.observe_document()?, true)?;
    let exact = save(&a)?;
    assert!(a.copy_document_clipboard_guarded(&a.observe_document()?)?.is_some());
    assert!(a.replace_document_plain_text_json_guarded(&a.observe_document()?, "bad").is_err());
    assert_eq!(save(&a)?, exact);
    a.set_read_only_guarded(&a.observe_document()?, false)?;
    replace(&mut a, "fresh", "X")?;
    a.undo()?;
    let exact = save(&a)?;
    assert!(
        a.replace_document_plain_text_json_guarded(
            &a.observe_document()?,
            &json!({"paragraph":"fresh","text":"Y"}).to_string()
        )
        .is_err()
    );
    assert_eq!(save(&a)?, exact);
    assert_eq!(a.redo_count(), 1);
    // Original text/node/grid DTO remains closed even while the new family is selected.
    assert!(serde_json::from_str::<Selection>("{\"kind\":\"document\"}").is_err());
    let point = TextPoint { block: "q1".into(), offset: 0, affinity: Affinity::After };
    a.set_selection(Some(&Selection::TextRange { anchor: point.clone(), focus: point }))?;
    assert!(!a.document_selected());
    Ok(())
}

#[test]
fn enabling_document_family_preserves_original_and_general_redo_and_is_one_way() -> Result {
    for general in [false, true] {
        for natural in [false, true] {
            let (p, mut a) = setup(false)?;
            if general {
                a.enable_general_ranges_guarded(&a.observe()?)?;
            }
            if natural {
                a.enable_typing_history_guarded(&a.observe()?)?;
            }
            a.apply(vec![Command::InsertText(InsertText {
                block: "q1".into(),
                offset: 0,
                text: "X".into(),
            })])?;
            let after = a.document_json().to_owned();
            a.undo()?;
            let before = a.document_json().to_owned();
            let causal = a.causal_version();
            a.enable_document_selection_guarded(&a.observe()?)?;
            assert_eq!(a.causal_version(), causal);
            assert_eq!((a.undo_count(), a.redo_count()), (0, 1));
            a.select_document_guarded(&a.observe_document()?)?;
            let exact = save(&a)?;
            assert!(!a.enable_general_ranges_guarded(&a.observe_document()?)?);
            assert!(!a.enable_document_selection_guarded(&a.observe_document()?)?);
            assert_eq!(save(&a)?, exact);
            let mut recovered = restore(&p, &a, &exact)?;
            assert_eq!(save(&recovered)?, exact);
            for redo in [true, false, true, false] {
                if redo {
                    a.redo()?;
                    recovered.redo()?;
                    assert_eq!(a.document_json(), after);
                } else {
                    a.undo()?;
                    recovered.undo()?;
                    assert_eq!(a.document_json(), before);
                }
                assert_eq!(save(&a)?, save(&recovered)?);
            }
        }
    }
    Ok(())
}

#[test]
fn live_receive_keeps_document_scope_and_copies_newly_observed_peer_roots() -> Result {
    for natural in [false, true] {
        let (p, mut a) = setup(false)?;
        let mut b = peer(&p, &a)?;
        enable(&mut a, natural)?;
        a.select_document_guarded(&a.observe_document()?)?;
        let previous = a.observe_document()?;
        b.apply(vec![Command::InsertBlocks(InsertBlocks {
            parent: None,
            before: None,
            nodes: vec![paragraph("arrived", "PEER")],
        })])?;
        let frame = b.update_frame()?;
        a.receive_frame(&frame)?;
        assert!(a.document_selected());
        assert!(a.check(&previous).is_err());
        let copied = a.copy_document_clipboard_guarded(&a.observe_document()?)?.ok_or("copy")?;
        assert!(copied.plain_text.contains("PEER"));
        let exact = save(&a)?;
        // Repeated identical frame does not discard scope or publish another observation.
        a.receive_frame(&frame)?;
        assert_eq!(save(&a)?, exact);
        let mut restored = restore(&p, &a, &exact)?;
        assert!(restored.document_selected());
        assert_eq!(save(&restored)?, exact);
        let before = a.document_json().to_owned();
        replace(&mut a, "whole", "Q")?;
        replace(&mut restored, "whole", "Q")?;
        assert_eq!(
            text(a.document_json(), "arrived")?,
            None,
            "received roots are now observed and selected"
        );
        a.undo()?;
        restored.undo()?;
        assert_eq!(a.document_json(), before);
        assert_eq!(save(&a)?, save(&restored)?);
    }
    Ok(())
}

//! Staged proposal effects are ordinary native groups, not durable review decisions or foreign Undo.
use breditor_collaboration::rich_replica::{
    Command, DocumentSuggestionDraft as Draft, DocumentSuggestionEdit as Edit,
    DocumentSuggestionPreparation as Preparation, DocumentSuggestionPreview as Preview,
    DocumentSuggestionScope as Scope, RichReplica, SharedRichProfile, WriterGroupPreparation,
    actions::{
        ClearTableCells, InsertColumn, InsertRow, InsertText, ListStyle, RangeTextRun,
        ReplaceDocumentPlainTextV1, ReplaceGeneralTextRangeV1, ReplaceTextRange, ResizeImage,
        SetFormat, SetHeading, SetImageCaption, WrapList,
    },
    selection::{Selection, TextPoint},
};
use breditor_core::rich_content::review::ReviewPrincipalId;
use serde_json::{Value, json};
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;

fn peers() -> Result<(SharedRichProfile, RichReplica, RichReplica)> {
    let profile = SharedRichProfile::from_standard_configuration_json_v3(
        r#"{"format":"breditor/shared-rich-profile","formatVersion":3,"schema":{"name":"example/suggestion-effects","version":1},"extensions":[]}"#,
    )?;
    let root: Value = serde_json::from_str(include_str!(
        "../../breditor-core/tests/fixtures/rich-local-root.json"
    ))?;
    let input = json!({"format":"breditor/document","formatVersion":2,"schema":{"name":"example/suggestion-effects","version":1},"schemaFingerprint":profile.schema().fingerprint().to_string(),"root":root}).to_string();
    let a = profile.create(&input, "101".into())?;
    let b = profile.join_frame("room".into(), "202".into(), &a.update_frame()?)?;
    Ok((profile, a, b))
}
fn configure(owner: &mut RichReplica, scope: u8, typing: bool) -> Result {
    match scope {
        0 => {}
        1 => {
            owner.enable_general_ranges_guarded(&owner.observe()?)?;
        }
        2 => {
            owner.enable_document_selection_guarded(&owner.observe()?)?;
        }
        _ => return Err("test scope".into()),
    }
    if typing {
        owner.enable_typing_history_guarded(&owner.observe()?)?;
    }
    Ok(())
}
fn save(owner: &RichReplica, scope: u8, typing: bool) -> Result<String> {
    Ok(match (scope, typing) {
        (0, false) => owner.checkpoint()?,
        (0, true) => owner.typing_checkpoint()?,
        (1, false) => owner.general_checkpoint()?,
        (1, true) => owner.general_typing_checkpoint()?,
        (2, false) => owner.document_checkpoint()?,
        (2, true) => owner.document_typing_checkpoint()?,
        _ => return Err("test policy".into()),
    })
}
fn restore(
    profile: &SharedRichProfile,
    saved: &str,
    scope: u8,
    typing: bool,
) -> Result<RichReplica> {
    Ok(match (scope, typing) {
        (0, false) => profile.restore("room", saved)?,
        (0, true) => profile.restore_typing("room", saved)?,
        (1, false) => profile.restore_general("room", saved)?,
        (1, true) => profile.restore_general_typing("room", saved)?,
        (2, false) => profile.restore_document("room", saved)?,
        (2, true) => profile.restore_document_typing("room", saved)?,
        _ => return Err("test policy".into()),
    })
}
fn proposal(owner: &RichReplica, scope: Scope, edit: Edit) -> Result<String> {
    Ok(owner.capture_document_suggestion_guarded(
        &owner.observe()?,
        "Review 日本 🙂",
        ReviewPrincipalId::try_new("alice")?,
        "1792200000000",
        Draft { scope, edit },
    )?)
}
fn ready(owner: &RichReplica, packet: &str) -> Result<Preview> {
    match owner.prepare_document_suggestion_guarded(&owner.observe()?, packet)? {
        Preparation::Ready(value) => Ok(value),
        _ => Err("expected ready proposal".into()),
    }
}
fn insert(block: &str, text: &str) -> Command {
    Command::InsertText(InsertText { block: block.into(), offset: 0, text: text.into() })
}
fn caret(owner: &mut RichReplica) -> Result {
    use breditor_collaboration::anchor::Affinity;
    let p = TextPoint { block: "caption".into(), offset: 0, affinity: Affinity::After };
    owner.set_selection_guarded(
        &owner.observe()?,
        Some(&Selection::TextRange { anchor: p.clone(), focus: p }),
    )?;
    Ok(())
}
fn text(input: &str, block: &str) -> Result<String> {
    fn find<'a>(node: &'a Value, block: &str) -> Option<&'a Value> {
        if node["properties"]["breditor/block-id"] == block {
            Some(node)
        } else {
            node["children"].as_array()?.iter().find_map(|child| find(child, block))
        }
    }
    let raw: Value = serde_json::from_str(input)?;
    let node = find(&raw["root"], block).ok_or("test text block")?;
    Ok(node["children"]
        .as_array()
        .ok_or("test text children")?
        .iter()
        .filter_map(|run| run["text"].as_str())
        .collect())
}
#[test]
fn one_staged_native_group_recovers_exactly_in_all_six_explicit_policies() -> Result {
    for scope in 0..=2 {
        for typing in [false, true] {
            let (profile, mut a, _) = peers()?;
            configure(&mut a, scope, typing)?;
            a.apply(vec![insert("caption", "Prior ")])?;
            a.undo()?; // A preview and uncommitted candidate must retain this Redo.
            let before = (save(&a, scope, typing)?, a.update_frame()?, a.view_json()?);
            let packet =
                proposal(&a, Scope::Commands, Edit::Commands(vec![insert("p", "Proposed ")]))?;
            let preview = ready(&a, &packet)?;
            let prepared = a.prepare_document_suggestion_effect(&preview)?;
            assert_eq!((save(&a, scope, typing)?, a.update_frame()?, a.view_json()?), before);
            assert_eq!(prepared.document_json(), preview.document_json());
            let saved = prepared.checkpoint()?;
            let frame = prepared.update_frame()?;
            let effect = prepared.effect().clone();
            assert_eq!(effect.suggestion_id, preview.info().id);
            assert_eq!(effect.writer_group.writer, "101");
            assert!(
                effect.semantic_from.parse::<i32>()? >= effect.writer_group.from.parse::<i32>()?
            );
            assert!(
                effect.semantic_from.parse::<i32>()?
                    < effect.writer_group.through.parse::<i32>()?
            );
            let mut recovered = restore(&profile, &saved, scope, typing)?;
            assert_eq!(a.commit_document_suggestion_effect(prepared)?, effect);
            assert_eq!(save(&a, scope, typing)?, saved);
            assert_eq!(a.update_frame()?, frame);
            assert_eq!(a.redo_count(), 0);
            assert_eq!(a.undo_count(), 1);
            for redo in [false, true, false, true] {
                if redo {
                    assert_eq!(a.redo()?, recovered.redo()?);
                } else {
                    assert_eq!(a.undo()?, recovered.undo()?);
                }
                assert_eq!(save(&a, scope, typing)?, save(&recovered, scope, typing)?);
                assert_eq!(a.update_frame()?, recovered.update_frame()?);
            }
            assert_eq!(a.document_json(), preview.document_json());
        }
    }
    Ok(())
}
#[test]
fn staging_is_repeatable_but_only_one_candidate_can_publish_on_its_exact_source() -> Result {
    let (_, mut a, _) = peers()?;
    let packet = proposal(&a, Scope::Commands, Edit::Commands(vec![insert("p", "Once ")]))?;
    let preview = ready(&a, &packet)?;
    let exact = a.checkpoint()?;
    let first = a.prepare_document_suggestion_effect(&preview)?;
    let second = a.prepare_document_suggestion_effect(&preview)?;
    assert_eq!(first.effect(), second.effect());
    assert_eq!(first.writer_group_json(), second.writer_group_json());
    assert_eq!(first.checkpoint()?, second.checkpoint()?);
    assert_eq!(a.checkpoint()?, exact);
    a.commit_document_suggestion_effect(first)?;
    let published = a.checkpoint()?;
    assert!(a.commit_document_suggestion_effect(second).is_err());
    assert!(a.prepare_document_suggestion_effect(&preview).is_err());
    assert_eq!(a.checkpoint()?, published);
    Ok(())
}
#[test]
fn foreign_stale_ui_read_only_and_peer_changes_cannot_publish_a_prepared_effect() -> Result {
    for change in 0..4 {
        let (_, mut a, mut b) = peers()?;
        let packet = proposal(&a, Scope::Commands, Edit::Commands(vec![insert("p", "New ")]))?;
        let preview = ready(&a, &packet)?;
        let prepared = a.prepare_document_suggestion_effect(&preview)?;
        assert!(b.prepare_document_suggestion_effect(&preview).is_err());
        match change {
            0 => {
                caret(&mut a)?;
            }
            1 => {
                a.set_read_only_guarded(&a.observe()?, true)?;
            }
            2 => {
                b.apply(vec![insert("caption", "Peer ")])?;
                a.receive_frame(&b.update_frame()?)?;
            }
            3 => {
                let exact = b.checkpoint()?;
                assert!(b.commit_document_suggestion_effect(prepared).is_err());
                assert_eq!(b.checkpoint()?, exact);
                continue;
            }
            _ => unreachable!(),
        }
        let exact = a.checkpoint()?;
        assert!(a.prepare_document_suggestion_effect(&preview).is_err());
        assert!(a.commit_document_suggestion_effect(prepared).is_err());
        assert_eq!(a.checkpoint()?, exact);
        if change == 1 {
            assert!(a.prepare_document_suggestion_effect(&ready(&a, &packet)?).is_err());
        }
    }
    Ok(())
}
#[test]
fn discarded_candidates_do_not_close_the_live_typing_group_or_consume_counters() -> Result {
    for scope in 0..=2 {
        let (_, mut a, _) = peers()?;
        let (_, mut control, _) = peers()?;
        for owner in [&mut a, &mut control] {
            configure(owner, scope, true)?;
            caret(owner)?;
            owner.insert_typing_text_guarded(&owner.observe()?, "A", 1)?;
        }
        let exact = save(&a, scope, true)?;
        let packet = proposal(&a, Scope::Commands, Edit::Commands(vec![insert("p", "Proposal ")]))?;
        let preview = ready(&a, &packet)?;
        for _ in 0..2 {
            drop(a.prepare_document_suggestion_effect(&preview)?);
        }
        assert_eq!(save(&a, scope, true)?, exact);
        a.insert_typing_text_guarded(&a.observe()?, "B", 2)?;
        control.insert_typing_text_guarded(&control.observe()?, "B", 2)?;
        assert_eq!(save(&a, scope, true)?, save(&control, scope, true)?);
        assert_eq!(a.update_frame()?, control.update_frame()?);
        assert_eq!(a.undo_count(), 1);
        assert_eq!(a.history_step_count(), 2);
    }
    Ok(())
}
#[test]
fn native_effects_cover_text_formats_headings_lists_table_axes_cells_and_image_captions() -> Result
{
    let cases = vec![
        vec![
            insert("p", "Text "),
            Command::SetFormat(SetFormat {
                block: "caption".into(),
                offset: 0,
                length: 2,
                format: json!({"type":"breditor-inline/italic","properties":{}}),
                enabled: true,
            }),
        ],
        vec![Command::SetHeading(SetHeading { block: "p".into(), level: Some(3) })],
        vec![Command::WrapList(WrapList {
            first: "p".into(),
            last: "p".into(),
            container: "proposed-list".into(),
            items: vec!["proposed-item".into()],
            style: ListStyle::Bullet,
        })],
        vec![Command::InsertRow(InsertRow {
            block: "table-block".into(),
            row_block: "proposed-row-block".into(),
            row: "proposed-row".into(),
            before: None,
        })],
        vec![Command::InsertColumn(InsertColumn {
            block: "table-block".into(),
            column: "proposed-column".into(),
            width: 150,
            before: None,
        })],
        vec![Command::ClearTableCells(ClearTableCells {
            anchor: "cell".into(),
            focus: "cell".into(),
            empty: vec!["proposed-empty".into()],
        })],
        vec![
            Command::SetImageCaption(SetImageCaption {
                block: "image-block".into(),
                caption: Some(
                    json!({"kind":"element","type":"breditor/paragraph","entityId":null,"properties":{"breditor/block-id":"proposed-caption"},"children":[{"kind":"text","text":"Caption 日本 🙂","formats":[]}]}),
                ),
            }),
            Command::ResizeImage(ResizeImage {
                block: "image-block".into(),
                size: Some([320, 180]),
            }),
        ],
    ];
    let mut separated_preparation = 0;
    for commands in cases {
        let (profile, mut a, mut b) = peers()?;
        let before = a.document_json().to_owned();
        let packet = proposal(&a, Scope::Commands, Edit::Commands(commands))?;
        let preview = ready(&a, &packet)?;
        let prepared = a.prepare_document_suggestion_effect(&preview)?;
        if prepared.effect().semantic_from.parse::<i32>()?
            > prepared.effect().writer_group.from.parse::<i32>()?
        {
            separated_preparation += 1;
        }
        let saved = prepared.checkpoint()?;
        let mut recovered = profile.restore("room", &saved)?;
        a.commit_document_suggestion_effect(prepared)?;
        b.receive_frame(&a.update_frame()?)?;
        assert_eq!(b.document_json(), preview.document_json());
        assert_eq!(
            b.undo_count(),
            0,
            "Foreign imports must not silently claim accepting-user Undo"
        );
        for redo in [false, true, false, true] {
            if redo {
                a.redo()?;
                recovered.redo()?;
            } else {
                a.undo()?;
                recovered.undo()?;
            }
            assert_eq!(a.document_json(), if redo { preview.document_json() } else { &before });
            assert_eq!(a.checkpoint()?, recovered.checkpoint()?);
        }
    }
    assert!(
        separated_preparation >= 4,
        "New immutable structures remain outside the semantic Undo span"
    );
    Ok(())
}
#[test]
fn whole_document_effect_requires_document_history_but_not_a_preexisting_ui_selection() -> Result {
    for scope in 0..=2 {
        for typing in [false, true] {
            let (profile, mut a, _) = peers()?;
            configure(&mut a, scope, typing)?;
            let before = a.document_json().to_owned();
            let exact = save(&a, scope, typing)?;
            let packet = proposal(
                &a,
                Scope::Document,
                Edit::Commands(vec![Command::ReplaceDocumentPlainTextV1(
                    ReplaceDocumentPlainTextV1 {
                        paragraph: "proposed-document".into(),
                        text: "Replacement".into(),
                    },
                )]),
            )?;
            let preview = ready(&a, &packet)?;
            assert!(!a.document_selected());
            let prepared = a.prepare_document_suggestion_effect(&preview);
            assert_eq!(save(&a, scope, typing)?, exact);
            if scope != 2 {
                assert!(prepared.is_err());
                continue;
            }
            let prepared = prepared?;
            let mut recovered = restore(&profile, &prepared.checkpoint()?, scope, typing)?;
            a.commit_document_suggestion_effect(prepared)?;
            assert!(
                a.document_selected(),
                "Explicit document scope retains the ordinary native scope recipe"
            );
            assert_eq!(a.document_json(), preview.document_json());
            for redo in [false, true] {
                if redo {
                    a.redo()?;
                    recovered.redo()?;
                } else {
                    a.undo()?;
                    recovered.undo()?;
                }
                assert_eq!(a.document_json(), if redo { preview.document_json() } else { &before });
                assert_eq!(save(&a, scope, typing)?, save(&recovered, scope, typing)?);
            }
        }
    }
    Ok(())
}
#[test]
fn existing_explicit_document_selection_uses_its_matching_observation_family() -> Result {
    for typing in [false, true] {
        let (profile, mut a, _) = peers()?;
        configure(&mut a, 2, typing)?;
        a.select_document_guarded(&a.observe_document()?)?;
        let packet = a.capture_document_suggestion_guarded(
            &a.observe_document()?,
            "Selected document",
            ReviewPrincipalId::try_new("alice")?,
            "0",
            Draft {
                scope: Scope::Document,
                edit: Edit::Commands(vec![Command::ReplaceDocumentPlainTextV1(
                    ReplaceDocumentPlainTextV1 {
                        paragraph: "selected-document".into(),
                        text: "Selected replacement".into(),
                    },
                )]),
            },
        )?;
        let Preparation::Ready(preview) =
            a.prepare_document_suggestion_guarded(&a.observe_document()?, &packet)?
        else {
            return Err("expected ready".into());
        };
        let exact = save(&a, 2, typing)?;
        let prepared = a.prepare_document_suggestion_effect(&preview)?;
        assert_eq!(save(&a, 2, typing)?, exact);
        let mut recovered = restore(&profile, &prepared.checkpoint()?, 2, typing)?;
        a.commit_document_suggestion_effect(prepared)?;
        for redo in [false, true] {
            if redo {
                a.redo()?;
                recovered.redo()?;
            } else {
                a.undo()?;
                recovered.undo()?;
            }
            assert_eq!(save(&a, 2, typing)?, save(&recovered, 2, typing)?);
            assert!(a.document_selected());
        }
    }
    Ok(())
}
#[test]
fn protected_general_range_effects_are_one_group_and_recover_in_both_directions() -> Result {
    use breditor_collaboration::anchor::Affinity;
    for scope in 0..=2 {
        for typing in [false, true] {
            for backward in [false, true] {
                let (profile, mut a, _) = peers()?;
                configure(&mut a, scope, typing)?;
                let p = TextPoint { block: "p".into(), offset: 1, affinity: Affinity::After };
                let caption =
                    TextPoint { block: "caption".into(), offset: 1, affinity: Affinity::After };
                let (anchor, focus) = if backward { (caption, p) } else { (p, caption) };
                let packet = proposal(
                    &a,
                    Scope::Commands,
                    Edit::GeneralText(ReplaceGeneralTextRangeV1 {
                        range: ReplaceTextRange {
                            anchor,
                            focus,
                            runs: vec![RangeTextRun {
                                text: "Replacement".into(),
                                formats: vec![],
                            }],
                        },
                        empty: vec![],
                    }),
                )?;
                let preview = ready(&a, &packet)?;
                let before = a.document_json().to_owned();
                let exact = save(&a, scope, typing)?;
                let prepared = a.prepare_document_suggestion_effect(&preview);
                assert_eq!(save(&a, scope, typing)?, exact);
                if scope == 0 {
                    assert!(prepared.is_err());
                    continue;
                }
                let prepared = prepared?;
                let mut recovered = restore(&profile, &prepared.checkpoint()?, scope, typing)?;
                a.commit_document_suggestion_effect(prepared)?;
                assert_eq!(a.undo_count(), 1);
                for redo in [false, true] {
                    if redo {
                        a.redo()?;
                        recovered.redo()?;
                    } else {
                        a.undo()?;
                        recovered.undo()?;
                    }
                    assert_eq!(
                        a.document_json(),
                        if redo { preview.document_json() } else { &before }
                    );
                    assert_eq!(save(&a, scope, typing)?, save(&recovered, scope, typing)?);
                }
            }
        }
    }
    Ok(())
}
#[test]
fn independent_host_writer_stages_v2_transport_without_reserving_the_proposer_stream() -> Result {
    let (profile, mut a, mut b) = peers()?;
    let mut host = profile.join_frame("room".into(), "303".into(), &a.update_frame()?)?;
    let packet = proposal(&a, Scope::Commands, Edit::Commands(vec![insert("p", "Accepted ")]))?;
    let preview = ready(&host, &packet)?;
    let prepared = host.prepare_document_suggestion_effect(&preview)?;
    let frame = prepared.writer_group_json().to_owned();
    let effect = prepared.effect().clone();
    assert_eq!(effect.writer_group.writer, "303");
    let WriterGroupPreparation::Prepared(transport) = b.prepare_writer_group_v2("303", &frame)?
    else {
        return Err("expected staged ordinary v2 transport".into());
    };
    assert_eq!(transport.receipt(), &effect.writer_group);
    assert!(!host.document_json().contains("Accepted "));
    assert!(!b.document_json().contains("Accepted "));
    // Offline ordinary edits remain possible while the host holds an unpublished candidate.
    a.apply(vec![insert("caption", "Offline "), insert("p", "Offline same block ")])?;
    host.commit_document_suggestion_effect(prepared)?;
    b.commit_writer_group(*transport)?;
    a.receive_frame(&host.update_frame()?)?;
    host.receive_frame(&a.update_frame()?)?;
    assert_eq!(a.document_json(), host.document_json());
    let combined = text(a.document_json(), "p")?;
    assert!(combined.contains("Accepted ") && combined.contains("Offline same block "));
    assert_eq!(combined.replace("Accepted ", "").replace("Offline same block ", ""), "a🙂b");
    assert_eq!(text(a.document_json(), "caption")?, "Offline xy🙂");
    assert!(
        matches!(b.prepare_writer_group_v2("303", &frame)?, WriterGroupPreparation::Duplicate(receipt) if receipt == effect.writer_group)
    );
    let mut recovered = profile.restore("room", &host.checkpoint()?)?;
    for redo in [false, true] {
        if redo {
            host.redo()?;
            recovered.redo()?;
        } else {
            host.undo()?;
            recovered.undo()?;
        }
        assert_eq!(host.checkpoint()?, recovered.checkpoint()?);
        assert_eq!(text(host.document_json(), "caption")?, "Offline xy🙂");
        assert_eq!(
            text(host.document_json(), "p")?,
            if redo { &combined } else { "Offline same block a🙂b" }
        );
        a.receive_frame(&host.update_frame()?)?;
        assert_eq!(a.document_json(), host.document_json());
    }
    a.undo()?;
    assert_eq!(text(a.document_json(), "p")?, "Accepted a🙂b");
    assert_eq!(text(a.document_json(), "caption")?, "xy🙂");
    Ok(())
}

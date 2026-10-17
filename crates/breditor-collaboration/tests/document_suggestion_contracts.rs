//! Proposed edits are native reads, not accepted operations or another document/history owner.
use breditor_collaboration::rich_replica::{
    Command, DocumentSuggestionDraft as Draft, DocumentSuggestionEdit as Edit,
    DocumentSuggestionPreparation as Preparation, DocumentSuggestionPreview as Preview,
    DocumentSuggestionScope as Scope, DocumentSuggestionSource as Source, RichReplica,
    SharedRichProfile, SuggestionConflictTarget,
    actions::{
        ClearTableCells, DeleteText, InsertColumn, InsertRow, InsertText, ListStyle, RangeTextRun,
        ReplaceDocumentPlainTextV1, ReplaceGeneralTextRangeV1, ReplaceImage, ReplaceTextRange,
        ResizeColumn, ResizeImage, SetBlockLayout, SetFormat, SetHeader, SetHeading, SetImageAlt,
        SetImageCaption, WrapList,
    },
    selection::{Selection, TextPoint},
};
use breditor_core::rich_content::review::ReviewPrincipalId;
use serde_json::{Value, json};
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;
fn peers() -> Result<(SharedRichProfile, RichReplica, RichReplica)> {
    let profile = SharedRichProfile::from_standard_configuration_json_v3(
        r#"{"format":"breditor/shared-rich-profile","formatVersion":3,"schema":{"name":"example/document-suggestions","version":1},"extensions":[]}"#,
    )?;
    let root: Value = serde_json::from_str(include_str!(
        "../../breditor-core/tests/fixtures/rich-local-root.json"
    ))?;
    let input = json!({"format":"breditor/document","formatVersion":2,"schema":{"name":"example/document-suggestions","version":1},"schemaFingerprint":profile.schema().fingerprint().to_string(),"root":root}).to_string();
    let a = profile.create(&input, "101".into())?;
    let b = profile.join_frame("room".into(), "202".into(), &a.update_frame()?)?;
    Ok((profile, a, b))
}
fn draft(commands: Vec<Command>) -> Draft {
    Draft { scope: Scope::Commands, edit: Edit::Commands(commands) }
}
fn capture(owner: &RichReplica, commands: Vec<Command>) -> Result<String> {
    Ok(owner.capture_document_suggestion_guarded(
        &owner.observe()?,
        "Proposed 日本 <literal> 🙂",
        ReviewPrincipalId::try_new("alice")?,
        "1792200000000",
        draft(commands),
    )?)
}
fn insert(block: &str, text: &str) -> Command {
    Command::InsertText(InsertText { block: block.into(), offset: 0, text: text.into() })
}
fn ready(owner: &RichReplica, packet: &str) -> Result<Preview> {
    match owner.prepare_document_suggestion_guarded(&owner.observe()?, packet)? {
        Preparation::Ready(preview) => Ok(preview),
        Preparation::Pending { .. } => Err("unexpected pending source".into()),
        Preparation::Conflict { targets } => {
            Err(format!("unexpected conflict: {targets:?}").into())
        }
    }
}
fn checkpoint(owner: &RichReplica, document: bool, typing: bool) -> Result<String> {
    Ok(match (document, typing) {
        (false, false) => owner.checkpoint()?,
        (false, true) => owner.typing_checkpoint()?,
        (true, false) => owner.document_checkpoint()?,
        (true, true) => owner.document_typing_checkpoint()?,
    })
}
fn find<'a>(node: &'a Value, block: &str) -> Option<&'a Value> {
    if node["properties"]["breditor/block-id"] == block {
        Some(node)
    } else {
        node["children"].as_array()?.iter().find_map(|child| find(child, block))
    }
}
fn text(input: &str, block: &str) -> Result<String> {
    let value: Value = serde_json::from_str(input)?;
    let node = find(&value["root"], block).ok_or("text block")?;
    Ok(node["children"]
        .as_array()
        .ok_or("text children")?
        .iter()
        .filter_map(|run| run["text"].as_str())
        .collect())
}
#[test]
fn captures_source_proven_pure_previews_across_all_selection_and_history_policies() -> Result {
    for document in [false, true] {
        for typing in [false, true] {
            let (profile, mut a, _) = peers()?;
            if document {
                a.enable_document_selection_guarded(&a.observe()?)?;
            }
            if typing {
                a.enable_typing_history_guarded(&a.observe()?)?;
            }
            a.apply(vec![insert("caption", "Prior history ")])?;
            a.undo()?;
            a.set_read_only_guarded(&a.observe()?, true)?;
            let exact = (checkpoint(&a, document, typing)?, a.update_frame()?, a.view_json()?);
            let packet = capture(&a, vec![insert("p", "Proposed ")])?;
            assert!(matches!(
                a.verify_document_suggestion_source(&packet)?,
                Source::Verified { .. }
            ));
            let preview = ready(&a, &packet)?;
            assert_eq!(text(preview.document_json(), "p")?, "Proposed a🙂b");
            assert_eq!(preview.before_assets(), preview.after_assets());
            assert_eq!(preview.after_assets()[0].asset, "asset");
            assert!(!preview.changes().is_empty());
            assert_eq!(
                (checkpoint(&a, document, typing)?, a.update_frame()?, a.view_json()?),
                exact
            );
            let saved = checkpoint(&a, document, typing)?;
            let restored = match (document, typing) {
                (false, false) => profile.restore("room", &saved)?,
                (false, true) => profile.restore_typing("room", &saved)?,
                (true, false) => profile.restore_document("room", &saved)?,
                (true, true) => profile.restore_document_typing("room", &saved)?,
            };
            assert_eq!(ready(&restored, &packet)?.document_json(), preview.document_json());
        }
    }
    Ok(())
}
#[test]
fn missing_offline_source_is_explicit_until_native_catchup_then_previews_without_importing_intent()
-> Result {
    let (_, mut a, mut b) = peers()?;
    a.apply(vec![insert("p", "Offline ")])?;
    let packet = capture(&a, vec![insert("p", "Review ")])?;
    let exact = b.checkpoint()?;
    assert_eq!(b.read_document_suggestion(&packet)?.author.as_str(), "alice");
    assert!(
        matches!(b.verify_document_suggestion_source(&packet)?, Source::Pending { missing } if missing.len() == 1)
    );
    assert!(
        matches!(b.prepare_document_suggestion_guarded(&b.observe()?, &packet)?, Preparation::Pending { missing } if missing.len() == 1)
    );
    assert_eq!(b.checkpoint()?, exact);
    b.receive_frame(&a.update_frame()?)?;
    assert_eq!(text(ready(&b, &packet)?.document_json(), "p")?, "Review Offline a🙂b");
    assert!(!b.document_json().contains("Review "));
    Ok(())
}
#[test]
fn affected_text_conflicts_but_unrelated_peer_text_is_preserved_in_the_new_preview() -> Result {
    let (_, mut a, mut b) = peers()?;
    let packet = capture(
        &a,
        vec![Command::DeleteText(DeleteText { block: "p".into(), offset: 0, length: 1 })],
    )?;
    b.apply(vec![insert("caption", "Unrelated peer ")])?;
    a.receive_frame(&b.update_frame()?)?;
    let preview = ready(&a, &packet)?;
    assert!(preview.document_json().contains("Unrelated peer xy🙂"));
    b.apply(vec![insert("p", "Changed target ")])?;
    a.receive_frame(&b.update_frame()?)?;
    let exact = a.checkpoint()?;
    assert!(
        matches!(a.prepare_document_suggestion_guarded(&a.observe()?, &packet)?, Preparation::Conflict { targets } if targets.contains(&SuggestionConflictTarget::Block { block: "p".into() }))
    );
    assert_eq!(a.checkpoint()?, exact);
    Ok(())
}
#[test]
fn equal_looking_replacement_characters_do_not_become_the_original_proposal_target() -> Result {
    let (_, mut a, mut b) = peers()?;
    let packet = capture(
        &a,
        vec![Command::DeleteText(DeleteText { block: "p".into(), offset: 0, length: 1 })],
    )?;
    let original = a.document_json().to_owned();
    b.apply(vec![
        Command::DeleteText(DeleteText { block: "p".into(), offset: 0, length: 1 }),
        insert("p", "a"),
        Command::SetFormat(SetFormat {
            block: "p".into(),
            offset: 0,
            length: 1,
            format: json!({"type":"breditor/strong","properties":{}}),
            enabled: true,
        }),
    ])?;
    assert_eq!(
        b.document_json(),
        original,
        "The peer replaced the source character with an equal-looking new character"
    );
    a.receive_frame(&b.update_frame()?)?;
    assert!(
        matches!(
            a.prepare_document_suggestion_guarded(&a.observe()?, &packet)?,
            Preparation::Conflict { .. }
        ),
        "An AST equality check cannot prove original character identity"
    );
    Ok(())
}
#[test]
fn independent_image_fields_and_caption_text_do_not_conflict_with_proposed_alt_text() -> Result {
    let (_, mut a, mut b) = peers()?;
    let packet = capture(
        &a,
        vec![Command::SetImageAlt(SetImageAlt {
            block: "image-block".into(),
            text: "New description".into(),
            decorative: false,
        })],
    )?;
    b.apply(vec![
        Command::ResizeImage(ResizeImage { block: "image-block".into(), size: Some([640, 360]) }),
        insert("caption", "Peer caption "),
    ])?;
    a.receive_frame(&b.update_frame()?)?;
    let preview = ready(&a, &packet)?;
    let raw: Value = serde_json::from_str(preview.document_json())?;
    let image = find(&raw["root"], "image-block").ok_or("image")?;
    assert_eq!(image["properties"]["breditor/alt-text"], "New description");
    assert_eq!(image["properties"]["breditor/width"], 640);
    assert!(preview.document_json().contains("Peer caption xy🙂"));
    b.apply(vec![Command::SetImageAlt(SetImageAlt {
        block: "image-block".into(),
        text: "Changed prior description".into(),
        decorative: false,
    })])?;
    a.receive_frame(&b.update_frame()?)?;
    assert!(matches!(
        a.prepare_document_suggestion_guarded(&a.observe()?, &packet)?,
        Preparation::Conflict { .. }
    ));
    Ok(())
}
#[test]
fn heading_and_layout_intents_keep_unrelated_text_and_independently_owned_fields() -> Result {
    let (_, mut a, mut b) = peers()?;
    let packet = capture(
        &a,
        vec![
            Command::SetHeading(SetHeading { block: "p".into(), level: Some(2) }),
            Command::SetBlockLayout(SetBlockLayout {
                block: "p".into(),
                patch_json: r#"{"alignment":"center"}"#.into(),
            }),
        ],
    )?;
    b.apply(vec![insert("p", "New text ")])?;
    a.receive_frame(&b.update_frame()?)?;
    let preview = ready(&a, &packet)?;
    assert_eq!(text(preview.document_json(), "p")?, "New text a🙂b");
    let raw: Value = serde_json::from_str(preview.document_json())?;
    assert_eq!(find(&raw["root"], "p").ok_or("paragraph")?["type"], "breditor/heading");
    Ok(())
}
#[test]
fn supported_primitive_batches_match_real_native_edits_and_retain_exact_future_history() -> Result {
    let commands = vec![
        insert("p", "Review "),
        Command::SetFormat(SetFormat {
            block: "caption".into(),
            offset: 0,
            length: 2,
            format: json!({"type":"breditor-inline/italic","properties":{}}),
            enabled: true,
        }),
        Command::ResizeColumn(ResizeColumn {
            block: "table-block".into(),
            column: "c".into(),
            width: 200,
        }),
        Command::ResizeImage(ResizeImage { block: "image-block".into(), size: Some([320, 180]) }),
        Command::ReplaceImage(ReplaceImage {
            block: "image-block".into(),
            asset: "new-asset".into(),
            generation: "new-generation".into(),
        }),
    ];
    for document in [false, true] {
        for typing in [false, true] {
            let (profile, mut a, _) = peers()?;
            if document {
                a.enable_document_selection_guarded(&a.observe()?)?;
            }
            if typing {
                a.enable_typing_history_guarded(&a.observe()?)?;
            }
            let packet = capture(&a, commands.clone())?;
            let proposed = ready(&a, &packet)?.document_json().to_owned();
            // Ordinary apply is a test oracle here, not a proposal Accept API or server decision.
            a.apply(commands.clone())?;
            assert_eq!(a.document_json(), proposed);
            let saved = checkpoint(&a, document, typing)?;
            let mut restored = match (document, typing) {
                (false, false) => profile.restore("room", &saved)?,
                (false, true) => profile.restore_typing("room", &saved)?,
                (true, false) => profile.restore_document("room", &saved)?,
                (true, true) => profile.restore_document_typing("room", &saved)?,
            };
            for redo in [false, true, false, true] {
                if redo {
                    assert_eq!(a.redo()?, restored.redo()?);
                } else {
                    assert_eq!(a.undo()?, restored.undo()?);
                }
                assert_eq!(
                    checkpoint(&a, document, typing)?,
                    checkpoint(&restored, document, typing)?
                );
                assert_eq!(a.update_frame()?, restored.update_frame()?);
            }
        }
    }
    Ok(())
}
#[test]
fn list_row_column_header_and_caption_creation_have_real_native_previews() -> Result {
    let cases = vec![
        vec![Command::WrapList(WrapList {
            first: "p".into(),
            last: "p".into(),
            container: "suggest-list".into(),
            items: vec!["suggest-item".into()],
            style: ListStyle::Bullet,
        })],
        vec![Command::InsertRow(InsertRow {
            block: "table-block".into(),
            row_block: "suggest-row-block".into(),
            row: "suggest-row".into(),
            before: None,
        })],
        vec![Command::InsertColumn(InsertColumn {
            block: "table-block".into(),
            column: "suggest-column".into(),
            width: 180,
            before: None,
        })],
        vec![Command::SetHeader(SetHeader { cells: vec!["cell".into()], header: true })],
        vec![Command::SetImageCaption(SetImageCaption {
            block: "image-block".into(),
            caption: Some(
                json!({"kind":"element","type":"breditor/paragraph","entityId":null,"properties":{"breditor/block-id":"suggest-caption"},"children":[{"kind":"text","text":"New caption","formats":[]}]}),
            ),
        })],
        vec![Command::ClearTableCells(ClearTableCells {
            anchor: "cell".into(),
            focus: "cell".into(),
            empty: vec!["suggest-empty".into()],
        })],
    ];
    for commands in cases {
        let (_, mut a, _) = peers()?;
        let packet = capture(&a, commands.clone())?;
        let preview = ready(&a, &packet)?.document_json().to_owned();
        assert_eq!(a.undo_count(), 0);
        a.apply(commands)?;
        assert_eq!(a.document_json(), preview);
        assert_eq!(a.undo_count(), 1);
    }
    Ok(())
}
#[test]
fn table_axis_proposal_keeps_unrelated_cell_text_while_caption_replacement_guards_old_caption()
-> Result {
    let (_, mut a, mut b) = peers()?;
    let row = capture(
        &a,
        vec![Command::InsertRow(InsertRow {
            block: "table-block".into(),
            row_block: "new-row-block".into(),
            row: "new-row".into(),
            before: None,
        })],
    )?;
    let caption = capture(
        &a,
        vec![Command::SetImageCaption(SetImageCaption {
            block: "image-block".into(),
            caption: None,
        })],
    )?;
    b.apply(vec![
        insert("p", "Unrelated cell text "),
        Command::ResizeImage(ResizeImage { block: "image-block".into(), size: Some([80, 60]) }),
    ])?;
    a.receive_frame(&b.update_frame()?)?;
    assert_eq!(text(ready(&a, &row)?.document_json(), "p")?, "Unrelated cell text a🙂b");
    ready(&a, &caption)?;
    b.apply(vec![insert("caption", "Unseen caption edit ")])?;
    a.receive_frame(&b.update_frame()?)?;
    assert!(matches!(
        a.prepare_document_suggestion_guarded(&a.observe()?, &caption)?,
        Preparation::Conflict { .. }
    ));
    Ok(())
}
#[test]
fn whole_document_intent_requires_explicit_scope_and_conflicts_with_any_changed_source() -> Result {
    let (_, mut a, mut b) = peers()?;
    let commands = vec![Command::ReplaceDocumentPlainTextV1(ReplaceDocumentPlainTextV1 {
        paragraph: "suggest-document".into(),
        text: "Proposed replacement".into(),
    })];
    assert!(capture(&a, commands.clone()).is_err());
    let packet = a.capture_document_suggestion_guarded(
        &a.observe()?,
        "Explicit document",
        ReviewPrincipalId::try_new("alice")?,
        "0",
        Draft { scope: Scope::Document, edit: Edit::Commands(commands) },
    )?;
    assert!(ready(&a, &packet)?.document_json().contains("Proposed replacement"));
    b.apply(vec![insert("caption", "Peer ")])?;
    a.receive_frame(&b.update_frame()?)?;
    assert!(
        matches!(a.prepare_document_suggestion_guarded(&a.observe()?, &packet)?, Preparation::Conflict { targets } if targets.contains(&SuggestionConflictTarget::Document))
    );
    Ok(())
}
#[test]
fn preview_guards_are_exact_owner_bound_and_must_be_renewed_after_disjoint_changes() -> Result {
    let (_, mut a, mut b) = peers()?;
    let packet = capture(&a, vec![insert("p", "Proposed ")])?;
    let preview = ready(&a, &packet)?;
    a.check_document_suggestion_preview(&preview)?;
    assert!(b.check_document_suggestion_preview(&preview).is_err());
    b.apply(vec![insert("caption", "Disjoint peer ")])?;
    a.receive_frame(&b.update_frame()?)?;
    assert!(a.check_document_suggestion_preview(&preview).is_err());
    let fresh = ready(&a, &packet)?;
    a.check_document_suggestion_preview(&fresh)?;
    assert!(fresh.document_json().contains("Disjoint peer xy🙂"));
    Ok(())
}
#[test]
fn rich_general_proposals_preserve_partial_tables_and_image_captions_in_both_directions() -> Result
{
    use breditor_collaboration::anchor::Affinity;
    use breditor_core::document::{FormatSet, TextRun};
    for typing in [false, true] {
        for backward in [false, true] {
            let (profile, mut a, _) = peers()?;
            a.enable_document_selection_guarded(&a.observe()?)?;
            if typing {
                a.enable_typing_history_guarded(&a.observe()?)?;
            }
            let p = TextPoint { block: "p".into(), offset: 1, affinity: Affinity::After };
            let caption =
                TextPoint { block: "caption".into(), offset: 1, affinity: Affinity::After };
            let (anchor, focus) = if backward { (caption, p) } else { (p, caption) };
            let action = ReplaceGeneralTextRangeV1 {
                range: ReplaceTextRange {
                    anchor: anchor.clone(),
                    focus: focus.clone(),
                    runs: vec![RangeTextRun { text: "Replacement".into(), formats: vec![] }],
                },
                empty: vec![],
            };
            let exact = checkpoint(&a, true, typing)?;
            let packet = a.capture_document_suggestion_guarded(
                &a.observe()?,
                "Protected rich range",
                ReviewPrincipalId::try_new("alice")?,
                "0",
                Draft { scope: Scope::Commands, edit: Edit::GeneralText(action) },
            )?;
            let preview = ready(&a, &packet)?.document_json().to_owned();
            assert_eq!(checkpoint(&a, true, typing)?, exact);
            let raw: Value = serde_json::from_str(&preview)?;
            assert!(find(&raw["root"], "table-block").is_some());
            assert!(find(&raw["root"], "image-block").is_some());
            assert_eq!(text(&preview, "p")?, "aReplacement");
            assert_eq!(text(&preview, "caption")?, "y🙂");
            let target = Selection::TextRange { anchor, focus };
            let inserted =
                TextRun::try_new("Replacement", FormatSet::try_from_formats(vec![])?)?.into();
            a.replace_general_range_text_guarded(&a.observe()?, &target, &inserted, &[])?;
            assert_eq!(a.document_json(), preview);
            let saved = checkpoint(&a, true, typing)?;
            let mut restored = if typing {
                profile.restore_document_typing("room", &saved)?
            } else {
                profile.restore_document("room", &saved)?
            };
            a.undo()?;
            restored.undo()?;
            assert_eq!(checkpoint(&a, true, typing)?, checkpoint(&restored, true, typing)?);
            a.redo()?;
            restored.redo()?;
            assert_eq!(a.document_json(), preview);
            assert_eq!(a.update_frame()?, restored.update_frame()?);
        }
    }
    Ok(())
}
#[test]
fn pure_proposal_reads_do_not_close_an_active_natural_typing_group() -> Result {
    use breditor_collaboration::anchor::Affinity;
    for document in [false, true] {
        let (_, mut a, _) = peers()?;
        let (_, mut control, _) = peers()?;
        let point = TextPoint { block: "caption".into(), offset: 0, affinity: Affinity::After };
        let caret = Selection::TextRange { anchor: point.clone(), focus: point };
        for owner in [&mut a, &mut control] {
            if document {
                owner.enable_document_selection_guarded(&owner.observe()?)?;
            }
            owner.enable_typing_history_guarded(&owner.observe()?)?;
            owner.set_selection_guarded(&owner.observe()?, Some(&caret))?;
            owner.insert_typing_text_guarded(&owner.observe()?, "A", 1)?;
        }
        assert_eq!(checkpoint(&a, document, true)?, checkpoint(&control, document, true)?);
        let before = checkpoint(&a, document, true)?;
        let packet = capture(&a, vec![insert("p", "Review ")])?;
        a.read_document_suggestion(&packet)?;
        a.verify_document_suggestion_source(&packet)?;
        let preview = ready(&a, &packet)?;
        a.check_document_suggestion_preview(&preview)?;
        assert_eq!(checkpoint(&a, document, true)?, before);
        a.insert_typing_text_guarded(&a.observe()?, "B", 2)?;
        control.insert_typing_text_guarded(&control.observe()?, "B", 2)?;
        assert_eq!(checkpoint(&a, document, true)?, checkpoint(&control, document, true)?);
        assert_eq!(a.update_frame()?, control.update_frame()?);
        assert_eq!(a.undo_count(), 1);
        assert_eq!(a.history_step_count(), 2);
        assert_eq!(text(a.document_json(), "caption")?, "ABxy🙂");
        a.undo()?;
        assert_eq!(text(a.document_json(), "caption")?, "xy🙂");
    }
    Ok(())
}
#[test]
fn malformed_foreign_stale_noop_and_over_budget_proposals_never_mutate_accepted_state() -> Result {
    let (_, mut a, b) = peers()?;
    let packet = capture(&a, vec![insert("p", "New ")])?;
    let observed = a.observe()?;
    assert!(
        b.capture_document_suggestion_guarded(
            &observed,
            "foreign",
            ReviewPrincipalId::try_new("alice")?,
            "0",
            draft(vec![insert("p", "x")])
        )
        .is_err()
    );
    a.apply(vec![insert("caption", "Changed ")])?;
    let exact = (a.checkpoint()?, a.update_frame()?, a.view_json()?);
    assert!(a.prepare_document_suggestion_guarded(&observed, &packet).is_err());
    for commands in
        [vec![], vec![insert("p", "")], vec![insert("missing", "x")], vec![insert("p", "x"); 65]]
    {
        assert!(capture(&a, commands).is_err());
    }
    for (title, time) in [("", "0"), ("x\n", "0"), ("ok", "01"), ("ok", "-1")] {
        assert!(
            a.capture_document_suggestion_guarded(
                &a.observe()?,
                title,
                ReviewPrincipalId::try_new("alice")?,
                time,
                draft(vec![insert("p", "x")])
            )
            .is_err()
        );
    }
    let mut raw: Value = serde_json::from_str(&packet)?;
    raw["data"]["title"] = json!("Forged");
    assert!(a.read_document_suggestion(&raw.to_string()).is_err());
    assert!(a.read_document_suggestion(&" ".repeat(1024 * 1024 + 1)).is_err());
    assert_eq!((a.checkpoint()?, a.update_frame()?, a.view_json()?), exact);
    Ok(())
}

//! Checked public-diff experiment for future accepting-user history. No inverse API is exposed.
//! These disposable native documents have no journal/host authority; actual history adoption still
//! needs an authenticated receipt, exclusive marker ownership, exact replay and one ordered stack.
use super::{Result, owner};
use crate::rich_replica::{
    Command, DocumentSuggestionDraft, DocumentSuggestionEdit, DocumentSuggestionPreparation,
    DocumentSuggestionScope, RichReplica,
    actions::{
        ClearTableCells, InsertColumn, InsertRow, InsertText, ListStyle, ResizeImage, SetFormat,
        SetHeading, SetImageCaption, WrapList,
    },
};
use breditor_core::rich_content::review::ReviewPrincipalId;
use loro::{Frontiers, LoroDoc};
use loro_internal::undo::DiffBatch;
use serde_json::json;
fn insert(block: &str, text: &str) -> Command {
    Command::InsertText(InsertText { block: block.into(), offset: 0, text: text.into() })
}
fn project(owner: &RichReplica, doc: &LoroDoc) -> Result<String> {
    super::super::super::layout_fields::validate(doc)?;
    let raw = super::super::super::materialize::envelope(doc)?;
    let decoded = owner.codec.decode(&raw.to_string())?;
    let document = breditor_core::rich_content::RichDocument::try_admit(
        owner.codec.schema(),
        decoded,
        owner.codec.limits(),
    )?;
    Ok(owner.codec.encode(document.document())?)
}
fn inverse(doc: &LoroDoc, before: &Frontiers, after: &Frontiers) -> Result<(Frontiers, Frontiers)> {
    let mut inverse: DiffBatch = doc.diff(after, before)?.into();
    let intervening: DiffBatch = doc.diff(after, &doc.state_frontiers())?.into();
    inverse.transform(&intervening, true);
    let from = doc.state_frontiers();
    doc.apply_diff(inverse.into())?;
    doc.commit();
    Ok((from, doc.state_frontiers()))
}
fn proposal(
    owner: &RichReplica,
    commands: Vec<Command>,
) -> Result<super::super::PreparedDocumentSuggestionEffect> {
    let packet = owner.capture_document_suggestion_guarded(
        &owner.observe()?,
        "Test effect",
        ReviewPrincipalId::try_new("alice")?,
        "0",
        DocumentSuggestionDraft {
            scope: DocumentSuggestionScope::Commands,
            edit: DocumentSuggestionEdit::Commands(commands),
        },
    )?;
    let DocumentSuggestionPreparation::Ready(preview) =
        owner.prepare_document_suggestion_guarded(&owner.observe()?, &packet)?
    else {
        return Err("expected ready".into());
    };
    Ok(owner.prepare_document_suggestion_effect(&preview)?)
}
#[test]
fn checked_native_inverse_matches_author_undo_for_rich_semantic_spans_not_preparation() -> Result {
    let cases = vec![
        vec![insert("p", "Accepted ")],
        vec![Command::SetHeading(SetHeading { block: "p".into(), level: Some(3) })],
        vec![Command::WrapList(WrapList {
            first: "p".into(),
            last: "p".into(),
            container: "accepted-list".into(),
            items: vec!["accepted-item".into()],
            style: ListStyle::Bullet,
        })],
        vec![Command::InsertRow(InsertRow {
            block: "table-block".into(),
            row_block: "accepted-row-block".into(),
            row: "accepted-row".into(),
            before: None,
        })],
        vec![Command::InsertColumn(InsertColumn {
            block: "table-block".into(),
            column: "accepted-column".into(),
            width: 150,
            before: None,
        })],
        vec![Command::ClearTableCells(ClearTableCells {
            anchor: "cell".into(),
            focus: "cell".into(),
            empty: vec!["accepted-empty".into()],
        })],
        vec![Command::SetImageCaption(SetImageCaption {
            block: "image-block".into(),
            caption: Some(
                json!({"kind":"element","type":"breditor/paragraph","entityId":null,"properties":{"breditor/block-id":"accepted-caption"},"children":[{"kind":"text","text":"New caption 日本 🙂","formats":[]}]}),
            ),
        })],
    ];
    for commands in cases {
        let mut author = owner()?;
        let mut peer = RichReplica::join_bound(
            author.codec.clone(),
            "room".into(),
            "202".into(),
            author.updates()?,
        )?;
        let prepared = proposal(&author, commands)?;
        let key = &prepared.candidate.history_keys.undo.last().ok_or("history")?.key;
        let (before, after) = prepared.candidate.cursors.latest_authored(key)?;
        let (mut before, mut after) = (before.clone(), after.clone());
        author.commit_document_suggestion_effect(prepared)?;
        // This is a genuinely different writer. It does not obtain the author's native stack.
        let doc = author.doc.fork();
        super::super::super::text_flow::configure(&doc);
        doc.set_peer_id(303)?;
        peer.apply(vec![Command::ResizeImage(ResizeImage {
            block: "image-block".into(),
            size: Some([80, 60]),
        })])?;
        author.receive_frame(&peer.update_frame()?)?;
        doc.import(&peer.updates()?)?;
        for redo in [false, true, false, true] {
            (before, after) = inverse(&doc, &before, &after)?;
            if redo {
                author.redo()?;
            } else {
                author.undo()?;
            }
            assert_eq!(project(&author, &doc)?, author.document_json());
            if !redo {
                assert!(
                    project(&author, &doc)?.contains("\"breditor/width\":80"),
                    "The unrelated peer size remains when Undo reveals the original image"
                );
            }
        }
    }
    Ok(())
}
#[test]
fn checked_foreign_text_inverse_preserves_peer_insertions_in_the_same_block() -> Result {
    let mut author = owner()?;
    let mut peer = RichReplica::join_bound(
        author.codec.clone(),
        "room".into(),
        "202".into(),
        author.updates()?,
    )?;
    let prepared = proposal(&author, vec![insert("p", "Accepted ")])?;
    let key = &prepared.candidate.history_keys.undo.last().ok_or("history")?.key;
    let (before, after) = prepared.candidate.cursors.latest_authored(key)?;
    let (mut before, mut after) = (before.clone(), after.clone());
    author.commit_document_suggestion_effect(prepared)?;
    peer.receive_frame(&author.update_frame()?)?;
    peer.apply(vec![insert("p", "Later ")])?;
    author.receive_frame(&peer.update_frame()?)?;
    let doc = author.doc.fork();
    super::super::super::text_flow::configure(&doc);
    doc.set_peer_id(303)?;
    for redo in [false, true, false, true] {
        (before, after) = inverse(&doc, &before, &after)?;
        if redo {
            author.redo()?;
        } else {
            author.undo()?;
        }
        assert_eq!(project(&author, &doc)?, author.document_json());
        assert!(project(&author, &doc)?.contains("Later "));
    }
    Ok(())
}
#[test]
fn checked_foreign_format_inverse_redo_retains_original_priority_below_later_peer_choice() -> Result
{
    let mut author = owner()?;
    let prepared = proposal(
        &author,
        vec![Command::SetFormat(SetFormat {
            block: "caption".into(),
            offset: 0,
            length: 2,
            format: json!({"type":"breditor-inline/italic","properties":{}}),
            enabled: true,
        })],
    )?;
    let key = &prepared.candidate.history_keys.undo.last().ok_or("history")?.key;
    let (before, after) = prepared.candidate.cursors.latest_authored(key)?;
    let (mut before, mut after) = (before.clone(), after.clone());
    author.commit_document_suggestion_effect(prepared)?;
    let mut peer = RichReplica::join_bound(
        author.codec.clone(),
        "room".into(),
        "202".into(),
        author.updates()?,
    )?;
    peer.apply(vec![Command::SetFormat(SetFormat {
        block: "caption".into(),
        offset: 0,
        length: 2,
        format: json!({"type":"breditor-inline/italic","properties":{}}),
        enabled: false,
    })])?;
    author.receive_frame(&peer.update_frame()?)?;
    let doc = author.doc.fork();
    super::super::super::text_flow::configure(&doc);
    doc.set_peer_id(303)?;
    for redo in [false, true, false, true] {
        (before, after) = inverse(&doc, &before, &after)?;
        if redo {
            author.redo()?;
        } else {
            author.undo()?;
        }
        assert_eq!(project(&author, &doc)?, author.document_json());
    }
    Ok(())
}

#[test]
fn checked_foreign_inverse_composes_with_an_ordered_mixed_history_without_marker_roots() -> Result {
    let cases = vec![
        vec![insert("p", "Accepted ")],
        vec![Command::SetHeading(SetHeading { block: "p".into(), level: Some(3) })],
        vec![Command::WrapList(WrapList {
            first: "p".into(),
            last: "p".into(),
            container: "accepted-list".into(),
            items: vec!["accepted-item".into()],
            style: ListStyle::Bullet,
        })],
        vec![Command::InsertRow(InsertRow {
            block: "table-block".into(),
            row_block: "accepted-row-block".into(),
            row: "accepted-row".into(),
            before: None,
        })],
        vec![Command::SetImageCaption(SetImageCaption {
            block: "image-block".into(),
            caption: Some(
                json!({"kind":"element","type":"breditor/paragraph","entityId":null,"properties":{"breditor/block-id":"accepted-caption"},"children":[{"kind":"text","text":"New caption 日本 🙂","formats":[]}]}),
            ),
        })],
    ];
    for commands in cases {
        let mut local = owner()?;
        let mut spans = Vec::new();
        local.apply(vec![insert("p", "Local before ")])?;
        let key = &local.history_keys.undo.last().ok_or("history")?.key;
        let (before, after) = local.cursors.latest_authored(key)?;
        spans.push((before.clone(), after.clone()));
        let mut host = RichReplica::join_bound(
            local.codec.clone(),
            "room".into(),
            "404".into(),
            local.updates()?,
        )?;
        let prepared = proposal(&host, commands)?;
        let key = &prepared.candidate.history_keys.undo.last().ok_or("history")?.key;
        let (before, after) = prepared.candidate.cursors.latest_authored(key)?;
        spans.push((before.clone(), after.clone()));
        host.commit_document_suggestion_effect(prepared)?;
        local.receive_frame(&host.update_frame()?)?;
        local.apply(vec![insert("p", "Local after ")])?;
        let key = &local.history_keys.undo.last().ok_or("history")?.key;
        let (before, after) = local.cursors.latest_authored(key)?;
        spans.push((before.clone(), after.clone()));
        host.receive_frame(&local.update_frame()?)?;
        let mut peer = RichReplica::join_bound(
            local.codec.clone(),
            "room".into(),
            "505".into(),
            local.updates()?,
        )?;
        peer.apply(vec![insert("p", "Later peer ")])?;
        local.receive_frame(&peer.update_frame()?)?;
        host.receive_frame(&peer.update_frame()?)?;
        let doc = local.doc.fork();
        super::super::super::text_flow::configure(&doc);
        doc.set_peer_id(303)?;
        for (index, redo) in [(2, false), (1, false), (0, false), (0, true), (1, true), (2, true)] {
            let (before, after) = &spans[index];
            spans[index] = inverse(&doc, before, after)?;
            if index == 1 {
                if redo {
                    host.redo()?;
                } else {
                    host.undo()?;
                }
                local.receive_frame(&host.update_frame()?)?;
            } else {
                if redo {
                    local.redo()?;
                } else {
                    local.undo()?;
                }
                host.receive_frame(&local.update_frame()?)?;
            }
            assert_eq!(project(&local, &doc)?, local.document_json());
            assert!(project(&local, &doc)?.contains("Later peer "));
        }
    }
    Ok(())
}

#[test]
fn even_a_valid_atom_receipt_cannot_reconstruct_a_semantic_basis_between_text_mark_atoms() -> Result
{
    let mut host = owner()?;
    let packet = host.capture_document_suggestion_guarded(
        &host.observe()?,
        "Format effect",
        ReviewPrincipalId::try_new("alice")?,
        "0",
        DocumentSuggestionDraft {
            scope: DocumentSuggestionScope::Commands,
            edit: DocumentSuggestionEdit::Commands(vec![Command::SetFormat(SetFormat {
                block: "caption".into(),
                offset: 0,
                length: 2,
                format: json!({"type":"breditor-inline/italic","properties":{}}),
                enabled: true,
            })]),
        },
    )?;
    let DocumentSuggestionPreparation::Ready(preview) =
        host.prepare_document_suggestion_guarded(&host.observe()?, &packet)?
    else {
        return Err("ready".into());
    };
    let prepared = host.prepare_document_suggestion_effect(&preview)?;
    let mut effect = prepared.effect().clone();
    host.commit_document_suggestion_effect(prepared)?;
    let changes = host.doc.export_json_in_id_span(loro::IdSpan::new(
        101,
        effect.writer_group.from.parse()?,
        effect.writer_group.through.parse()?,
    ));
    let split = changes
        .iter()
        .flat_map(|change| &change.ops)
        .find_map(|op| {
            matches!(op.content, loro::JsonOpContent::Text(loro::JsonTextOp::Mark { .. }))
                .then_some(op.counter + 1)
        })
        .ok_or("expected mark atoms")?;
    effect.semantic_from = split.to_string();
    effect.writer_group.from = split.to_string();
    effect.writer_group.group_digest =
        super::super::super::writer_transport::atomic_digest_for_doc(
            &host,
            &host.doc,
            101,
            split,
            effect.writer_group.through.parse()?,
        )?;
    assert!(matches!(
        host.retained_writer_receipt_v2(&effect.writer_group)?,
        crate::rich_replica::WriterReceiptRetention::Verified { .. }
    ));
    let before = host.checkpoint()?;
    let error = host
        .verify_document_suggestion_effect_guarded(&host.observe()?, &packet, &effect)
        .err()
        .ok_or("unsafe split cut admitted")?;
    assert!(error.to_string().contains("splits text mark"));
    assert_eq!(host.checkpoint()?, before);
    Ok(())
}

#[test]
fn operation_only_history_drops_future_handles_without_relaxing_live_freshness() -> Result {
    let mut live = owner()?;
    let before = live.doc.state_vv();
    let command = Command::SetImageCaption(SetImageCaption {
        block: "image-block".into(),
        caption: Some(
            json!({"kind":"element","type":"breditor/paragraph","entityId":null,"properties":{"breditor/block-id":"future-caption"},"children":[{"kind":"text","text":"Created later","formats":[]}]}),
        ),
    });
    let packet = live.capture_document_suggestion_guarded(
        &live.observe()?,
        "Creation",
        ReviewPrincipalId::try_new("alice")?,
        "0",
        DocumentSuggestionDraft {
            scope: DocumentSuggestionScope::Commands,
            edit: DocumentSuggestionEdit::Commands(vec![command.clone()]),
        },
    )?;
    let DocumentSuggestionPreparation::Ready(preview) =
        live.prepare_document_suggestion_guarded(&live.observe()?, &packet)?
    else {
        return Err("ready".into());
    };
    let prepared = live.prepare_document_suggestion_effect(&preview)?;
    live.commit_document_suggestion_effect(prepared)?;
    let saved = live.checkpoint()?;
    let snapshot = live.doc.fork_at(&live.doc.vv_to_frontiers(&before))?;
    assert_eq!(snapshot.state_vv(), before);
    assert_eq!(snapshot.oplog_vv(), before);
    assert!(
        super::super::super::model::optional_metadata(&snapshot, "future-caption").is_some()
            || super::super::super::model::existing_text(&snapshot, "future-caption").is_some(),
        "The pinned snapshot cut retains an empty future allocation, not a historical definition"
    );
    let clean = super::super::super::retained_history::at_vector(&live.doc, &before)?;
    assert!(super::super::super::model::optional_metadata(&clean, "future-caption").is_none());
    assert!(super::super::super::model::existing_text(&clean, "future-caption").is_none());
    assert!(matches!(
        live.verify_document_suggestion_source(&packet)?,
        crate::rich_replica::DocumentSuggestionSource::Verified { .. }
    ));
    assert!(
        live.capture_document_suggestion_guarded(
            &live.observe()?,
            "Reuse",
            ReviewPrincipalId::try_new("alice")?,
            "1",
            DocumentSuggestionDraft {
                scope: DocumentSuggestionScope::Commands,
                edit: DocumentSuggestionEdit::Commands(vec![command])
            },
        )
        .is_err(),
        "Current edits must still refuse a genuinely retained creation ID"
    );
    assert_eq!(live.checkpoint()?, saved);
    Ok(())
}

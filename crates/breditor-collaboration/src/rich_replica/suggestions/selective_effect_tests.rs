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

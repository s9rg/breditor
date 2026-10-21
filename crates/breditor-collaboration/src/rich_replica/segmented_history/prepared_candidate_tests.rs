//! Explicit staged-generation getters retain native publication guards and original-family refusals.
use super::super::{
    Command, DocumentSuggestionDraft, DocumentSuggestionEdit, DocumentSuggestionPreparation,
    DocumentSuggestionScope, PreparedWriterGroup, RichReplica, WriterGroupPreparation,
    actions::InsertText,
};
use super::tests::{Result, cold, enable, equal, insert, setup};
use breditor_core::rich_content::review::ReviewPrincipalId;
use serde_json::Value;

fn prepare(owner: &RichReplica, frame: &str, atomic: bool) -> Result<PreparedWriterGroup> {
    let prepared = if atomic {
        owner.prepare_writer_group_v2("202", frame)?
    } else {
        owner.prepare_writer_group("202", frame)?
    };
    let WriterGroupPreparation::Prepared(candidate) = prepared else {
        return Err("expected native candidate".into());
    };
    Ok(*candidate)
}

fn exercise(version: u32, standard: bool, scope: u8, mask: u8, atomic: bool) -> Result {
    let (profile, mut owner) = setup(version, standard, scope, mask)?;
    insert(&mut owner, "retained ")?;
    insert(&mut owner, "saved redo ")?;
    assert!(owner.undo()?);
    let mut oracle = owner.staged()?;
    let mut peer = profile.join_frame("room".into(), "202".into(), &owner.update_frame()?)?;
    insert(&mut peer, "peer preserved ")?;
    let groups: Value = serde_json::from_str(&if atomic {
        peer.writer_groups_v2_guarded(&peer.observe()?, "0")?
    } else {
        peer.writer_groups_guarded(&peer.observe()?, "0")?
    })?;
    let frame = groups["groups"][0].as_str().ok_or("writer group")?;
    let original = prepare(&oracle, frame, atomic)?;
    assert!(original.segmented_checkpoint().is_err());
    enable(&mut owner)?;
    let before = owner.segmented_checkpoint()?;
    let observed = owner.observe()?;
    let staged = prepare(&owner, frame, atomic)?;
    assert!(staged.checkpoint().is_err());
    assert_eq!(staged.receipt(), original.receipt());
    assert_eq!(staged.update_frame()?, original.update_frame()?);
    let saved = staged.segmented_checkpoint()?;
    let recovered = profile.restore_segmented("room", &saved)?;
    assert_eq!(recovered.segmented_checkpoint()?, saved);
    assert_eq!(recovered.document_json(), staged.document_json());
    assert_eq!(owner.segmented_checkpoint()?, before);
    drop(staged);
    owner.check(&observed)?;
    let staged = prepare(&owner, frame, atomic)?;
    assert_eq!(staged.segmented_checkpoint()?, saved);
    owner.commit_writer_group(staged)?;
    oracle.commit_writer_group(original)?;
    assert_eq!(owner.segmented_checkpoint()?, saved);
    equal(&owner, &oracle)?;
    for redo in [false, true] {
        assert!(if redo { owner.redo()? } else { owner.undo()? });
        assert!(if redo { oracle.redo()? } else { oracle.undo()? });
        equal(&owner, &oracle)?;
        assert!(owner.document_json().contains("peer preserved "));
        owner = cold(&profile, &owner)?;
    }
    Ok(())
}

#[test]
fn all_288_staged_transport_candidates_keep_exact_cold_history_and_original_receipts() -> Result {
    let mut cases = 0;
    for version in [1, 2, 3] {
        for standard in [false, true] {
            for scope in 0..3 {
                for mask in 0..8 {
                    for atomic in [false, true] {
                        exercise(version, standard, scope, mask, atomic)?;
                        cases += 1;
                    }
                }
            }
        }
    }
    assert_eq!(cases, 288);
    Ok(())
}

#[test]
fn suggestion_candidate_reads_remain_pure_and_old_preparations_cannot_cross_the_boundary() -> Result
{
    let (profile, mut owner) = setup(3, true, 2, 7)?;
    insert(&mut owner, "retained ")?;
    let packet = owner.capture_document_suggestion_guarded(
        &owner.observe()?,
        "Retained acceptance",
        ReviewPrincipalId::try_new("alice")?,
        "0",
        DocumentSuggestionDraft {
            scope: DocumentSuggestionScope::Commands,
            edit: DocumentSuggestionEdit::Commands(vec![Command::InsertText(InsertText {
                block: "p".into(),
                offset: 0,
                text: "accepted ".into(),
            })]),
        },
    )?;
    let DocumentSuggestionPreparation::Ready(preview) =
        owner.prepare_document_suggestion_guarded(&owner.observe()?, &packet)?
    else {
        return Err("original preview".into());
    };
    let original = owner.prepare_document_suggestion_effect(&preview)?;
    assert!(original.segmented_checkpoint().is_err());
    original.checkpoint()?;
    enable(&mut owner)?;
    let before = owner.segmented_checkpoint()?;
    let observed = owner.observe()?;
    let DocumentSuggestionPreparation::Ready(preview) =
        owner.prepare_document_suggestion_guarded(&observed, &packet)?
    else {
        return Err("segmented preview".into());
    };
    let prepared = owner.prepare_document_suggestion_effect(&preview)?;
    assert!(prepared.checkpoint().is_err());
    assert_eq!(prepared.effect(), original.effect());
    let saved = prepared.segmented_checkpoint()?;
    assert_eq!(profile.restore_segmented("room", &saved)?.segmented_checkpoint()?, saved);
    assert_eq!(owner.segmented_checkpoint()?, before);
    owner.check(&observed)?;
    assert!(owner.commit_document_suggestion_effect(original).is_err());
    assert_eq!(owner.segmented_checkpoint()?, before);
    owner.commit_document_suggestion_effect(prepared)?;
    assert_eq!(owner.segmented_checkpoint()?, saved);
    Ok(())
}

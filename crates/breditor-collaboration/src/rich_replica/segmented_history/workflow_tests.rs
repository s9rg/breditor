//! Actual search, accepted structural review, offline transport and retained native capacity.
use super::super::{
    Command, DocumentSuggestionDraft, DocumentSuggestionEdit, DocumentSuggestionEffectVerification,
    DocumentSuggestionPreparation, DocumentSuggestionScope, OwnedSuggestionAcceptance, RichReplica,
    WriterGroupPreparation,
    actions::{InsertRow, InsertText, SetHeading, SetImageCaption},
    selection::{Selection, TextPoint},
};
use super::tests::{Result, cold, enable, equal, insert, seal, setup};
use crate::{Error, anchor::Affinity};
use breditor_core::rich_content::{
    RichSearchMode, RichSearchQuery, RichSearchReplacement, RichSearchReplacementMode,
    review::ReviewPrincipalId,
};
use serde_json::{Value, json};

#[test]
fn failed_staging_keeps_the_original_natural_group_available_for_the_next_keystroke() -> Result {
    let (profile, mut owner) = setup(3, true, 2, 1)?;
    let point = TextPoint { block: "p".into(), offset: 0, affinity: Affinity::After };
    owner.set_selection(Some(&Selection::TextRange { anchor: point.clone(), focus: point }))?;
    let mut oracle = owner.staged()?;
    enable(&mut owner)?;
    owner.insert_typing_text_guarded(&owner.observe()?, "A", 1)?;
    oracle.insert_typing_text_guarded(&oracle.observe()?, "A", 1)?;
    let before = owner.segmented_checkpoint()?;
    let guard = owner.observe()?;
    assert!(
        owner
            .apply(vec![Command::InsertText(InsertText {
                block: "p".into(),
                offset: u32::MAX,
                text: "invalid".into(),
            })])
            .is_err()
    );
    assert!(owner.seal_history_segment_guarded(&guard, "gen-0".into()).is_err());
    owner.check(&guard)?;
    assert_eq!(owner.segmented_checkpoint()?, before);
    owner.insert_typing_text_guarded(&guard, "B", 2)?;
    oracle.insert_typing_text_guarded(&oracle.observe()?, "B", 2)?;
    assert_eq!(owner.undo_count(), 1);
    equal(&owner, &oracle)?;
    owner = cold(&profile, &owner)?;
    for redo in [false, true] {
        assert!(if redo { owner.redo()? } else { owner.undo()? });
        assert!(if redo { oracle.redo()? } else { oracle.undo()? });
        equal(&owner, &oracle)?;
    }
    Ok(())
}

fn replace(owner: &mut RichReplica) -> Result {
    let query = RichSearchQuery::try_new("cat", RichSearchMode::Literal, true, false)?;
    let result = owner.find_text_guarded(&owner.observe()?, &query)?;
    assert_eq!(result.results().matches().len(), 2);
    let request = RichSearchReplacement::try_new("dog", RichSearchReplacementMode::Literal)?;
    assert!(owner.replace_search_all_guarded(&owner.observe()?, &result, &request)?);
    Ok(())
}
fn adopt(
    owner: &mut RichReplica,
    packet: &str,
    receipt: &OwnedSuggestionAcceptance,
) -> Result<bool> {
    let DocumentSuggestionEffectVerification::Verified(proof) = owner
        .verify_document_suggestion_effect_guarded(&owner.observe()?, packet, &receipt.effect)?
    else {
        return Err("expected actual native effect verification".into());
    };
    Ok(owner.adopt_suggestion_history_guarded(&proof, packet, receipt.clone())?)
}

#[test]
fn search_and_owned_table_image_heading_effects_keep_order_and_exact_future_history() -> Result {
    let (profile, mut owner) = setup(3, true, 2, 7)?;
    insert(&mut owner, "cat cat ")?;
    let mut oracle = owner.staged()?;
    enable(&mut owner)?;
    replace(&mut owner)?;
    replace(&mut oracle)?;
    equal(&owner, &oracle)?;
    seal(&mut owner, "gen-2")?;
    let mut host = profile.join_frame("room".into(), "900".into(), &owner.update_frame()?)?;
    let packet = host.capture_document_suggestion_guarded(
        &host.observe()?,
        "Review",
        ReviewPrincipalId::try_new("proposer")?,
        "0",
        DocumentSuggestionDraft {
            scope: DocumentSuggestionScope::Commands,
            edit: DocumentSuggestionEdit::Commands(vec![
                Command::SetHeading(SetHeading { block: "p".into(), level: Some(3) }),
                Command::InsertRow(InsertRow {
                    block: "table-block".into(),
                    row_block: "reviewed-row-block".into(),
                    row: "reviewed-row".into(),
                    before: None,
                }),
                Command::SetImageCaption(SetImageCaption {
                    block: "image-block".into(),
                    caption: Some(json!({"kind":"element","type":"breditor/paragraph",
                        "entityId":null,"properties":{"breditor/block-id":"reviewed-caption"},
                        "children":[{"kind":"text","text":"Reviewed 🙂","formats":[]}]})),
                }),
            ]),
        },
    )?;
    let DocumentSuggestionPreparation::Ready(preview) =
        host.prepare_document_suggestion_guarded(&host.observe()?, &packet)?
    else {
        return Err("expected ready review preview".into());
    };
    let prepared = host.prepare_document_suggestion_effect(&preview)?;
    let effect = host.commit_document_suggestion_effect(prepared)?;
    let frame = host.update_frame()?;
    owner.receive_frame(&frame)?;
    oracle.receive_frame(&frame)?;
    let receipt = OwnedSuggestionAcceptance {
        binding: "a".repeat(64),
        sequence: "1".into(),
        principal: ReviewPrincipalId::try_new("alice")?,
        accepting_writer: "101".into(),
        effect,
    };
    assert!(adopt(&mut owner, &packet, &receipt)?);
    assert!(adopt(&mut oracle, &packet, &receipt)?);
    equal(&owner, &oracle)?;
    seal(&mut owner, "gen-3")?;
    insert(&mut owner, "after ")?;
    insert(&mut oracle, "after ")?;
    owner = cold(&profile, &owner)?;
    for redo in [false, false, false, true, true, true] {
        assert!(if redo { owner.redo()? } else { owner.undo()? });
        assert!(if redo { oracle.redo()? } else { oracle.undo()? });
        equal(&owner, &oracle)?;
        owner = cold(&profile, &owner)?;
    }
    let before = owner.segmented_checkpoint()?;
    assert!(!adopt(&mut owner, &packet, &receipt)?);
    assert_eq!(owner.segmented_checkpoint()?, before);
    Ok(())
}

fn send(owner: &RichReplica, receiver: &mut RichReplica, from: &str) -> Result<String> {
    let batch: Value =
        serde_json::from_str(&owner.writer_groups_v2_guarded(&owner.observe()?, from)?)?;
    assert_eq!(batch["hasMore"], false);
    let groups = batch["groups"].as_array().ok_or("groups")?;
    assert!(!groups.is_empty());
    for group in groups {
        let group = group.as_str().ok_or("group")?;
        let WriterGroupPreparation::Prepared(prepared) =
            receiver.prepare_writer_group_v2(owner.writer(), group)?
        else {
            return Err("expected prepared offline group".into());
        };
        receiver.commit_writer_group(*prepared)?;
        assert!(matches!(
            receiver.prepare_writer_group_v2(owner.writer(), group)?,
            WriterGroupPreparation::Duplicate(_)
        ));
    }
    assert_eq!(receiver.document_json(), owner.document_json());
    assert_eq!(receiver.writer_clock_v2(owner.writer())?, owner.writer_clock_v2(owner.writer())?);
    Ok(batch["through"].as_str().ok_or("through")?.into())
}

#[test]
fn offline_writer_groups_resume_at_the_same_acknowledged_boundary_across_cold_seals() -> Result {
    let (profile, mut owner) = setup(3, true, 2, 7)?;
    let mut receiver = profile.join_frame("room".into(), "707".into(), &owner.update_frame()?)?;
    let from = owner.writer_clock_v2(owner.writer())?.through;
    enable(&mut owner)?;
    insert(&mut owner, "first ")?;
    seal(&mut owner, "gen-2")?;
    owner = cold(&profile, &owner)?;
    insert(&mut owner, "offline ")?;
    let through = send(&owner, &mut receiver, &from)?;
    assert!(owner.undo()?);
    seal(&mut owner, "gen-3")?;
    owner = cold(&profile, &owner)?;
    assert!(owner.redo()?);
    send(&owner, &mut receiver, &through)?;
    assert_eq!(owner.undo_count(), 2);
    Ok(())
}

#[test]
fn native_1000_item_budget_refuses_without_evicting_the_oldest_retained_item() -> Result {
    let (profile, mut owner) = setup(1, false, 0, 0)?;
    enable(&mut owner)?;
    for index in 0..1000 {
        if index == 500 {
            seal(&mut owner, "gen-2")?;
        }
        insert(&mut owner, "x")?;
    }
    assert_eq!(owner.undo_count(), 1000);
    let first = (owner.history_keys.undo[0].key.clone(), owner.history_keys.undo[0].steps);
    let before = owner.segmented_checkpoint()?;
    let guard = owner.observe()?;
    assert!(matches!(
        owner.apply(vec![Command::InsertText(InsertText {
            block: "p".into(),
            offset: 0,
            text: "overflow".into(),
        })]),
        Err(Error::Limit("segmented retained undo items"))
    ));
    owner.check(&guard)?;
    assert_eq!(owner.segmented_checkpoint()?, before);
    let mut restored = cold(&profile, &owner)?;
    assert_eq!(restored.undo_count(), 1000);
    assert_eq!(
        (&restored.history_keys.undo[0].key, restored.history_keys.undo[0].steps),
        (&first.0, first.1)
    );
    for redo in [false, true] {
        assert!(if redo { owner.redo()? } else { owner.undo()? });
        assert!(if redo { restored.redo()? } else { restored.undo()? });
        equal(&owner, &restored)?;
    }
    Ok(())
}

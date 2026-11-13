//! Native laws for explicit continuation of a same-writer document.
use super::super::{Command, WriterGroupPreparation, actions::InsertText};
use super::tests::{Result, cold, enable, equal, insert, seal, setup};
use crate::Error;
use serde_json::Value;

#[test]
fn continuation_keeps_all_1001_undo_groups_and_the_original_offline_writer_receipts() -> Result {
    let (profile, mut owner) = setup(1, false, 0, 0)?;
    enable(&mut owner)?;
    for index in 0..1000 {
        if index == 500 {
            seal(&mut owner, "gen-2")?;
        }
        insert(&mut owner, "x")?;
    }
    let prior = owner.segmented_checkpoint()?;
    let acknowledged = owner.writer_clock_v2(owner.writer())?.through;
    let mut peer = profile.join_frame("room".into(), "202".into(), &owner.update_frame()?)?;
    assert_eq!(owner.undo_count(), 1000);
    let oldest = owner.history_keys.undo.first().ok_or("missing first Undo item")?.key.clone();
    let guard = owner.observe()?;
    assert!(matches!(
        owner.apply(vec![Command::InsertText(InsertText {
            block: "p".into(),
            offset: 0,
            text: "over capacity".into(),
        })]),
        Err(Error::Limit("segmented retained undo items"))
    ));
    assert_eq!(owner.segmented_checkpoint()?, prior);
    owner.continue_history_guarded(&guard, "continued-1".into())?;
    assert_eq!(owner.writer_clock_v2(owner.writer())?.through, acknowledged);
    assert!(owner.segmented_checkpoint().is_err());
    assert!(profile.restore_continued_history("room", &prior).is_err());

    insert(&mut owner, "offline ")?;
    assert_eq!(owner.undo_count(), 1001);
    assert!(owner.undo()?);
    assert_eq!(owner.redo_count(), 1);
    seal(&mut owner, "continued-2")?;
    let saved = owner.continued_history_checkpoint()?;
    let old: Value = serde_json::from_str(&prior)?;
    let current: Value = serde_json::from_str(&saved)?;
    assert_eq!(current["continuedAfter"], 2);
    assert_eq!(current["rootCheckpoint"], old["rootCheckpoint"]);
    assert_eq!(current["sealed"][0], old["sealed"][0]);
    assert_eq!(current["sealed"][1], old["active"]);
    assert!(profile.restore_segmented("room", &saved).is_err());
    for invalid in [0, 63, 500] {
        let mut changed = saved.clone();
        let from = format!("\"continuedAfter\":{}", current["continuedAfter"]);
        changed = changed.replacen(&from, &format!("\"continuedAfter\":{invalid}"), 1);
        assert_ne!(changed, saved);
        assert!(profile.restore_continued_history("room", &changed).is_err());
    }

    let mut restored = profile.restore_continued_history("room", &saved)?;
    equal(&owner, &restored)?;
    assert_eq!(restored.continued_history_checkpoint()?, saved);
    assert_eq!(restored.history_keys.undo.first().ok_or("missing first Undo item")?.key, oldest);
    assert_eq!(restored.redo_count(), 1);
    assert!(restored.redo()?);
    assert!(owner.redo()?);
    assert!(restored.undo()?);
    assert!(owner.undo()?);
    assert!(restored.undo()?);
    assert!(owner.undo()?);
    equal(&owner, &restored)?;

    let batch: Value = serde_json::from_str(
        &restored.writer_groups_v2_guarded(&restored.observe()?, &acknowledged)?,
    )?;
    let groups = batch["groups"].as_array().ok_or("missing offline groups")?;
    assert!(!groups.is_empty());
    for group in groups {
        let json = group.as_str().ok_or("missing native group")?;
        let WriterGroupPreparation::Prepared(prepared) =
            peer.prepare_writer_group_v2(restored.writer(), json)?
        else {
            return Err("expected a genuine offline group".into());
        };
        peer.commit_writer_group(*prepared)?;
        assert!(matches!(
            peer.prepare_writer_group_v2(restored.writer(), json)?,
            WriterGroupPreparation::Duplicate(_)
        ));
    }
    assert_eq!(peer.document_json(), restored.document_json());
    assert_eq!(
        peer.writer_clock_v2(restored.writer())?,
        restored.writer_clock_v2(restored.writer())?
    );
    Ok(())
}

#[test]
fn continuation_can_seal_a_full_v1_generation_catalog_without_rewriting_it() -> Result {
    let (profile, mut owner) = setup(3, true, 2, 7)?;
    enable(&mut owner)?;
    for generation in 2..64 {
        insert(&mut owner, "x")?;
        seal(&mut owner, &format!("gen-{generation}"))?;
    }
    insert(&mut owner, "last V1 entry")?;
    owner = cold(&profile, &owner)?;
    let before = owner.segmented_checkpoint()?;
    let observed = owner.observe()?;
    assert!(owner.seal_history_segment_guarded(&observed, "over-limit".into()).is_err());
    assert!(owner.continue_history_guarded(&observed, "gen-1".into()).is_err());
    owner.check(&observed)?;
    assert_eq!(owner.segmented_checkpoint()?, before);
    owner.continue_history_guarded(&observed, "gen-64".into())?;
    assert!(owner.continue_history_guarded(&owner.observe()?, "again".into()).is_err());
    insert(&mut owner, "continued")?;
    seal(&mut owner, "gen-65")?;
    let checkpoint = owner.continued_history_checkpoint()?;
    let restored = profile.restore_continued_history("room", &checkpoint)?;
    assert_eq!(restored.continued_history_checkpoint()?, checkpoint);
    equal(&owner, &restored)?;
    Ok(())
}

#[test]
fn an_empty_active_file_can_be_retained_after_v1_was_already_sealed() -> Result {
    let (profile, mut owner) = setup(1, false, 0, 0)?;
    enable(&mut owner)?;
    insert(&mut owner, "x")?;
    assert!(owner.undo()?);
    seal(&mut owner, "gen-2")?;
    let prior = owner.segmented_checkpoint()?;
    let old: Value = serde_json::from_str(&prior)?;
    owner.continue_history_guarded(&owner.observe()?, "continued".into())?;
    assert!(owner.seal_history_segment_guarded(&owner.observe()?, "empty".into()).is_err());
    let saved = owner.continued_history_checkpoint()?;
    let current: Value = serde_json::from_str(&saved)?;
    assert_eq!(current["sealed"][1], old["active"]);
    let mut restored = profile.restore_continued_history("room", &saved)?;
    equal(&owner, &restored)?;
    assert!(owner.redo()?);
    assert!(restored.redo()?);
    equal(&owner, &restored)?;
    Ok(())
}

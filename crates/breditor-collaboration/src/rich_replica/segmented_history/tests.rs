//! Independent legacy/cold-replay oracles for actual segmented native history and causal inputs.
use super::super::{
    Command, ReviewedHistoryIdentity, RichReplica, SharedRichProfile,
    actions::InsertText,
    selection::{Selection, TextPoint},
    session::Entry,
};
use super::{archive::Archive, binding::Family, encoding, segment::Sealed};
use crate::{Error, anchor::Affinity};
use loro::ExportMode;
use serde_json::{Value, json};
pub(super) type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;

pub(super) fn setup(
    version: u32,
    standard: bool,
    scope: u8,
    mask: u8,
) -> Result<(SharedRichProfile, RichReplica)> {
    let config=json!({"format":"breditor/shared-rich-profile","formatVersion":version,"schema":{"name":"example/segmented-history","version":1},"extensions":[]}).to_string();
    let profile = match (version, standard) {
        (1, false) => SharedRichProfile::from_configuration_json(&config)?,
        (1, true) => SharedRichProfile::from_standard_configuration_json_v1(&config)?,
        (2, false) => SharedRichProfile::from_configuration_json_v2(&config)?,
        (2, true) => SharedRichProfile::from_standard_configuration_json_v2(&config)?,
        (3, false) => SharedRichProfile::from_configuration_json_v3(&config)?,
        _ => SharedRichProfile::from_standard_configuration_json_v3(&config)?,
    };
    let root: Value = serde_json::from_str(include_str!(
        "../../../../breditor-core/tests/fixtures/rich-local-root.json"
    ))?;
    let input=json!({"format":"breditor/document","formatVersion":2,"schema":{"name":"example/segmented-history","version":1},"schemaFingerprint":profile.schema().fingerprint().to_string(),"root":root}).to_string();
    let mut owner = profile.create(&input, "101".into())?;
    if scope == 1 {
        owner.enable_general_ranges_guarded(&owner.observe()?)?;
    }
    if scope == 2 {
        owner.enable_document_selection_guarded(&owner.observe()?)?;
    }
    if mask & 1 != 0 {
        owner.enable_typing_history_guarded(&owner.observe()?)?;
    }
    if mask & 2 != 0 {
        owner.enable_reviewed_history_guarded(
            &owner.observe()?,
            serde_json::from_value::<ReviewedHistoryIdentity>(
                json!({"binding":"a".repeat(64),"principal":"alice","effectWriter":"900"}),
            )?,
        )?;
    }
    if mask & 4 != 0 {
        owner.enable_search_history_guarded(&owner.observe()?)?;
    }
    Ok((profile, owner))
}
pub(super) fn insert(owner: &mut RichReplica, text: &str) -> Result {
    owner.apply(vec![Command::InsertText(InsertText {
        block: "p".into(),
        offset: 0,
        text: text.into(),
    })])?;
    Ok(())
}
pub(super) fn enable(owner: &mut RichReplica) -> Result {
    owner.enable_segmented_history_guarded(&owner.observe()?, "gen-0".into(), "gen-1".into())?;
    Ok(())
}
pub(super) fn seal(owner: &mut RichReplica, id: &str) -> Result {
    owner.seal_history_segment_guarded(&owner.observe()?, id.into())?;
    Ok(())
}
pub(super) fn equal(a: &RichReplica, b: &RichReplica) -> Result {
    assert_eq!(a.document_json(), b.document_json());
    assert_eq!(a.causal_version(), b.causal_version());
    assert_eq!(a.journal.ui, b.journal.ui);
    assert_eq!(a.undo_count(), b.undo_count());
    assert_eq!(a.redo_count(), b.redo_count());
    assert_eq!(a.history_step_count(), b.history_step_count());
    for writer in ["101", "202"] {
        assert_eq!(a.writer_clock_v2(writer)?, b.writer_clock_v2(writer)?);
    }
    Ok(())
}
pub(super) fn cold(profile: &SharedRichProfile, owner: &RichReplica) -> Result<RichReplica> {
    let saved = owner.segmented_checkpoint()?;
    let restored = profile.restore_segmented("room", &saved)?;
    assert_eq!(restored.segmented_checkpoint()?, saved);
    equal(owner, &restored)?;
    Ok(restored)
}

#[test]
fn segment_smoke_keeps_saved_redo_and_a_cold_native_owner() -> Result {
    let (profile, mut owner) = setup(1, false, 0, 0)?;
    insert(&mut owner, "X")?;
    owner.undo()?;
    let mut oracle = owner.staged()?;
    enable(&mut owner)?;
    eprintln!("SEGMENT_SMOKE enabled");
    assert!(owner.redo()?);
    assert!(oracle.redo()?);
    if std::env::var_os("BREDITOR_SEGMENTED_TRACE").is_some() {
        eprintln!(
            "SEGMENT_LIVE_REDO {}",
            serde_json::to_string(owner.journal.entries.last().unwrap())?
        );
        eprintln!(
            "SEGMENT_REPLAY_REDO {}",
            serde_json::to_string(oracle.journal.entries.last().unwrap())?
        );
    }
    equal(&owner, &oracle)?;
    eprintln!("SEGMENT_SMOKE redone");
    seal(&mut owner, "gen-2")?;
    eprintln!("SEGMENT_SMOKE sealed");
    assert!(owner.undo()?);
    assert!(oracle.undo()?);
    equal(&owner, &oracle)?;
    eprintln!("SEGMENT_SMOKE undone");
    let mut restored = cold(&profile, &owner)?;
    eprintln!("SEGMENT_SMOKE cold restored");
    assert!(restored.redo()?);
    assert!(owner.redo()?);
    equal(&owner, &restored)
}

#[test]
fn all_144_native_families_keep_original_redo_peer_work_and_future_history_across_two_seals()
-> Result {
    let mut cases = 0;
    for version in [1, 2, 3] {
        for standard in [false, true] {
            for scope in 0..3 {
                for mask in 0..8 {
                    let (profile, mut owner) = setup(version, standard, scope, mask)?;
                    insert(&mut owner, "retained ")?;
                    insert(&mut owner, "redo ")?;
                    owner.undo()?;
                    let original = owner.staged()?;
                    let mut oracle = owner.staged()?;
                    let old = Family::of(&original).checkpoint(&original)?;
                    let mut peer =
                        profile.join_frame("room".into(), "202".into(), &owner.update_frame()?)?;
                    insert(&mut peer, "peer ")?;
                    enable(&mut owner)?;
                    equal(&owner, &oracle)?;
                    owner.verify_segmented_recovery_origin_guarded(
                        &owner.observe()?,
                        &original,
                        &original.observe()?,
                    )?;
                    assert!(
                        owner
                            .verify_recovery_origin_guarded(
                                &owner.observe()?,
                                &original,
                                &original.observe()?
                            )
                            .is_err()
                    );
                    assert!(Family::of(&original).checkpoint(&owner).is_err());
                    assert!(
                        Family::of(&original)
                            .restore(&profile, "room", &owner.segmented_checkpoint()?)
                            .is_err()
                    );
                    assert_eq!(Family::of(&original).checkpoint(&original)?, old);
                    assert!(owner.redo()?);
                    assert!(oracle.redo()?);
                    equal(&owner, &oracle)?;
                    seal(&mut owner, "gen-2")?;
                    owner.receive_frame(&peer.update_frame()?)?;
                    oracle.receive_frame(&peer.update_frame()?)?;
                    equal(&owner, &oracle)?;
                    seal(&mut owner, "gen-3")?;
                    for redo in [false, true, false, false, true, true] {
                        assert!(if redo { owner.redo()? } else { owner.undo()? });
                        assert!(if redo { oracle.redo()? } else { oracle.undo()? });
                        equal(&owner, &oracle)?;
                        assert!(owner.document_json().contains("peer"));
                        owner = cold(&profile, &owner)?;
                    }
                    cases += 1;
                }
            }
        }
    }
    assert_eq!(cases, 144);
    Ok(())
}

#[test]
fn real_more_than_1000_entries_retain_redo_across_three_generations_and_cold_replay() -> Result {
    let (profile, mut owner) = setup(1, false, 0, 0)?;
    insert(&mut owner, "X")?;
    owner.undo()?;
    let original = owner.checkpoint()?;
    enable(&mut owner)?;
    for _ in 0..500 {
        assert!(owner.redo()?);
        assert!(owner.undo()?);
    }
    let info = owner.segmented_history_info().unwrap();
    assert_eq!(info.retained_entries, 1002);
    assert_eq!(info.active_entries, 1000);
    assert_eq!(info.redo_items, 1);
    let before = owner.segmented_checkpoint()?;
    let guard = owner.observe()?;
    assert!(matches!(
        owner.redo(),
        Err(Error::Limit("segmented history generations or active entries"))
    ));
    assert_eq!(owner.segmented_checkpoint()?, before);
    owner.check(&guard)?;
    seal(&mut owner, "gen-2")?;
    assert!(owner.redo()?);
    seal(&mut owner, "gen-3")?;
    assert!(owner.undo()?);
    let after = owner.segmented_checkpoint()?;
    let prior = Archive::read(&before)?;
    let current = Archive::read(&after)?;
    assert_eq!(current.root_checkpoint, original);
    assert_eq!(current.sealed.0[0], prior.active);
    assert_eq!(owner.redo_count(), 1);
    let mut restored = cold(&profile, &owner)?;
    assert!(restored.redo()?);
    assert!(owner.redo()?);
    equal(&owner, &restored)?;
    Ok(())
}

#[test]
fn natural_typing_closes_only_at_explicit_generation_boundaries_and_keeps_all_groups() -> Result {
    let (profile, mut owner) = setup(3, true, 2, 1)?;
    let point = TextPoint { block: "p".into(), offset: 0, affinity: Affinity::After };
    owner.set_selection(Some(&Selection::TextRange { anchor: point.clone(), focus: point }))?;
    owner.insert_typing_text_guarded(&owner.observe()?, "A", 1)?;
    owner.insert_typing_text_guarded(&owner.observe()?, "B", 2)?;
    let mut oracle = owner.staged()?;
    enable(&mut owner)?;
    for (text, clock) in [("C", 3), ("D", 4)] {
        owner
            .insert_typing_text_guarded(&owner.observe()?, text, clock)
            .map_err(|error| format!("live typing {text}: {error}"))?;
        oracle
            .insert_typing_text_guarded(&oracle.observe()?, text, clock)
            .map_err(|error| format!("oracle typing {text}: {error}"))?;
    }
    seal(&mut owner, "gen-2")?;
    oracle.close_typing_group_guarded(&oracle.observe()?)?;
    for (text, clock) in [("E", 5), ("F", 6)] {
        owner
            .insert_typing_text_guarded(&owner.observe()?, text, clock)
            .map_err(|error| format!("live typing {text}: {error}"))?;
        oracle
            .insert_typing_text_guarded(&oracle.observe()?, text, clock)
            .map_err(|error| format!("oracle typing {text}: {error}"))?;
    }
    assert_eq!(owner.undo_count(), 3);
    equal(&owner, &oracle)?;
    owner =
        cold(&profile, &owner).map_err(|error| format!("natural typing cold replay: {error}"))?;
    for redo in [false, false, false, true, true, true] {
        assert!(if redo { owner.redo()? } else { owner.undo()? });
        assert!(if redo { oracle.redo()? } else { oracle.undo()? });
        equal(&owner, &oracle)?;
    }
    Ok(())
}

#[test]
fn pending_causal_inputs_survive_native_forks_seals_and_cold_reopen_until_dependencies_arrive()
-> Result {
    let (profile, mut owner) = setup(3, true, 2, 1)?;
    insert(&mut owner, "local ")?;
    let mut peer = profile.join_frame("room".into(), "202".into(), &owner.update_frame()?)?;
    let from = peer.doc.oplog_vv();
    insert(&mut peer, "first ")?;
    let first = peer.doc.export(ExportMode::updates(&from))?;
    let middle = peer.doc.oplog_vv();
    insert(&mut peer, "second ")?;
    let second = peer.doc.export(ExportMode::updates(&middle))?;
    let mut oracle = owner.staged()?;
    enable(&mut owner)?;
    owner.receive(second.clone())?;
    oracle.receive(second.clone())?;
    equal(&owner, &oracle)?;
    assert!(!owner.document_json().contains("second"));
    seal(&mut owner, "gen-2")?;
    insert(&mut owner, "offline ")?;
    insert(&mut oracle, "offline ")?;
    owner = cold(&profile, &owner)?;
    assert!(owner.journal.retained_updates().any(|bytes| bytes == second));
    owner.receive(first.clone())?;
    oracle.receive(first)?;
    equal(&owner, &oracle)?;
    assert!(owner.document_json().contains("second"));
    assert!(owner.undo()?);
    assert!(oracle.undo()?);
    equal(&owner, &oracle)?;
    assert!(owner.document_json().contains("second"));
    Ok(())
}

#[test]
fn failed_payloads_family_changes_readonly_reused_ids_and_empty_seals_keep_the_exact_source()
-> Result {
    let (_, mut owner) = setup(3, true, 0, 0)?;
    insert(&mut owner, "X")?;
    enable(&mut owner)?;
    let before = owner.segmented_checkpoint()?;
    let observed = owner.observe()?;
    assert!(owner.seal_history_segment_guarded(&observed, "gen-2".into()).is_err());
    assert!(owner.enable_general_ranges_guarded(&observed).is_err());
    assert!(
        owner
            .apply(vec![Command::InsertText(InsertText {
                block: "p".into(),
                offset: u32::MAX,
                text: "bad".into()
            })])
            .is_err()
    );
    assert_eq!(owner.segmented_checkpoint()?, before);
    owner.check(&observed)?;
    insert(&mut owner, "Y")?;
    let before = owner.segmented_checkpoint()?;
    for id in ["gen-0", "gen-1", ""] {
        assert!(owner.seal_history_segment_guarded(&owner.observe()?, id.into()).is_err());
        assert_eq!(owner.segmented_checkpoint()?, before);
    }
    owner.set_read_only_guarded(&owner.observe()?, true)?;
    let before = owner.segmented_checkpoint()?;
    assert!(owner.seal_history_segment_guarded(&owner.observe()?, "gen-2".into()).is_err());
    assert_eq!(owner.segmented_checkpoint()?, before);
    Ok(())
}

#[test]
fn repairing_hash_links_does_not_hide_a_changed_native_effect_from_cold_replay() -> Result {
    let (profile, mut owner) = setup(3, true, 2, 0)?;
    insert(&mut owner, "root ")?;
    enable(&mut owner)?;
    insert(&mut owner, "sealed ")?;
    seal(&mut owner, "gen-2")?;
    insert(&mut owner, "active ")?;
    let saved = owner.segmented_checkpoint()?;
    let mut archive = Archive::read(&saved)?;
    let mut changed = Sealed::read(&archive.sealed.0[0])?.record;
    let Entry::Local { expected, .. } = &mut changed.entries[0] else {
        panic!("expected actual native local record")
    };
    *expected = Value::Null;
    let changed = Sealed::from_record(changed)?;
    archive.sealed.0[0] = changed.json.to_string();
    let mut active = Sealed::read(&archive.active)?.record;
    active.parent_sha256 = changed.sha256;
    archive.active = Sealed::from_record(active)?.json.to_string();
    assert!(matches!(
        profile.restore_segmented("room", &archive.encode()?),
        Err(Error::ReplayMismatch)
    ));
    let mut truncated = Archive::read(&saved)?;
    truncated.sealed.0.clear();
    assert!(profile.restore_segmented("room", &truncated.encode()?).is_err());
    assert!(profile.restore_segmented("room", &(saved.clone() + " ")).is_err());
    assert!(profile.restore_segmented("other", &saved).is_err());
    assert_eq!(owner.segmented_checkpoint()?, saved);
    Ok(())
}

#[test]
fn native_continuity_keeps_exact_seals_and_old_active_identity_instead_of_only_equal_text() -> Result
{
    let (profile, mut owner) = setup(3, true, 2, 1)?;
    insert(&mut owner, "root ")?;
    let legacy = owner.staged()?;
    enable(&mut owner)?;
    insert(&mut owner, "first ")?;
    let before = cold(&profile, &owner)?;
    seal(&mut owner, "gen-2")?;
    insert(&mut owner, "second ")?;
    seal(&mut owner, "gen-3")?;
    owner.verify_segmented_recovery_origin_guarded(
        &owner.observe()?,
        &legacy,
        &legacy.observe()?,
    )?;
    owner.verify_segmented_recovery_origin_guarded(
        &owner.observe()?,
        &before,
        &before.observe()?,
    )?;
    let mut fork = profile.restore_segmented("room", &before.segmented_checkpoint()?)?;
    seal(&mut fork, "other-generation")?;
    insert(&mut fork, "second ")?;
    assert_eq!(fork.document_json(), owner.document_json());
    assert!(
        owner
            .verify_segmented_recovery_origin_guarded(&owner.observe()?, &fork, &fork.observe()?)
            .is_err()
    );
    Ok(())
}

#[test]
fn independent_generation_and_archive_budgets_refuse_without_pruning_history() -> Result {
    let (_, mut owner) = setup(1, false, 0, 0)?;
    enable(&mut owner)?;
    for i in 2..64 {
        insert(&mut owner, "x")?;
        seal(&mut owner, &format!("gen-{i}"))?;
    }
    insert(&mut owner, "last")?;
    let before = owner.segmented_checkpoint()?;
    assert!(owner.seal_history_segment_guarded(&owner.observe()?, "overflow".into()).is_err());
    assert_eq!(owner.segmented_checkpoint()?, before);
    assert_eq!(owner.segmented_history_info().unwrap().sealed_generations, 63);
    assert!(matches!(
        Archive::read(&" ".repeat(encoding::MAX_ARCHIVE_BYTES + 1)),
        Err(Error::Limit("segmented history archive bytes"))
    ));
    Ok(())
}

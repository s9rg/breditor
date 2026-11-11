//! Rotation headroom is checked before a new durable prefix can consume it.
use super::{
    Command, Error, InsertText, Role, Room, RotationPoint, TestResult, send, setup, snapshot,
};
use crate::assets::AssetStore;
use std::{collections::BTreeMap, fs, path::Path};

pub(in crate::room) fn retain_interrupted_stages(
    path: &Path,
    mut room: Room,
    count: usize,
) -> TestResult<Room> {
    // Every abandoned continuation came from a real rotation publication.
    for _ in 0..count {
        room.log.interrupt_rotation_for_test(RotationPoint::ContinuationReady)?;
        assert!(matches!(
            room.rotate_log_generation("owner", "interrupted-staging"),
            Err(Error::Contract("test interruption after durable physical prefix"))
        ));
        drop(room);
        (room, _) = Room::open_log_generations(path)?;
    }
    Ok(room)
}

#[test]
fn exhausted_rotation_staging_budget_preserves_offline_history_and_future_undo() -> TestResult {
    let (files, mut room, profile) = setup()?;
    room.grant("owner", "alice", Some(Role::Editor))?;
    let registered = room.register("alice")?;
    let mut author = profile.join_frame(
        "room".into(),
        registered.lease.writer.clone(),
        &room.catchup("alice")?,
    )?;
    author.apply(vec![Command::InsertText(InsertText {
        block: "p".into(),
        offset: 0,
        text: "Saved before interrupted rotations ".into(),
    })])?;
    let mut through = send(&mut room, &author, &registered.lease, "0")?;
    author.apply(vec![Command::InsertText(InsertText {
        block: "p".into(),
        offset: 0,
        text: "Offline during rotations ".into(),
    })])?;
    let saved = author.checkpoint()?;
    let expected = room.catchup("owner")?;

    room = retain_interrupted_stages(&files.room(), room, 63)?;
    assert_eq!(snapshot(&files)?.keys().filter(|name| name.starts_with(".stage-")).count(), 63);
    let before = snapshot(&files)?;
    let descriptor = room.log_generation_descriptor("owner")?;
    let assets = AssetStore::open(&files.recovery(), room.asset_binding())?;
    let capacity = room.storage_capacity(&assets, "owner")?;
    let rotation = capacity.log.rotation.ok_or("actual physical rotation capacity")?;
    assert_eq!(rotation.unpublished_stages, 63);
    assert!(!rotation.staging_available);
    assert!(!rotation.can_rotate);
    assert!(capacity.log.active.records_remaining > 0);
    assert!(capacity.log.active.framed_bytes_remaining > 0);
    assert!(matches!(room.storage_capacity(&assets, "alice"), Err(Error::Permission)));
    // The continuation and one metadata publication may be staged together.
    assert!(matches!(
        room.rotate_log_generation("owner", "two"),
        Err(Error::Contract("physical rotation staging capacity"))
    ));
    assert_eq!(snapshot(&files)?, before);
    assert_eq!(room.log_generation_descriptor("owner")?, descriptor);
    assert_eq!(room.storage_capacity(&assets, "owner")?, capacity);
    assert_eq!(room.catchup("owner")?, expected);

    drop(room);
    let (mut room, recovery) = Room::open_log_generations(&files.room())?;
    assert_eq!(recovery.truncated_bytes, 0);
    assert_eq!(room.storage_capacity(&assets, "owner")?, capacity);
    let lease = room.resume("alice", &registered.lease.writer, &registered.credential)?;
    let mut author = profile.restore("room", &saved)?;
    through = send(&mut room, &author, &lease, &through)?;
    for redo in [false, true] {
        assert!(if redo { author.redo()? } else { author.undo()? });
        through = send(&mut room, &author, &lease, &through)?;
        let observer = profile.join_frame("room".into(), "901".into(), &room.catchup("owner")?)?;
        assert_eq!(observer.document_json(), author.document_json());
    }
    let after = room.catchup("owner")?;
    drop(room);
    assert_eq!(Room::open_log_generations(&files.room())?.0.catchup("owner")?, after);
    Ok(())
}

fn fill_pending_rotation(files: &super::Files, mut room: Room) -> TestResult<String> {
    room.log.interrupt_rotation_for_test(RotationPoint::IntentSynced)?;
    assert!(matches!(
        room.rotate_log_generation("owner", "pending"),
        Err(Error::Contract("test interruption after durable physical prefix"))
    ));
    drop(room);

    // Model a prior interruption that left an unselected control alias while
    // the durable rotation intent already owned its continuation.
    let abandoned = files.room().join(format!(".stage-{}", crate::credentials::issue()?));
    fs::copy(files.room().join(".head.json"), &abandoned)?;
    let marker: serde_json::Value =
        serde_json::from_slice(&fs::read(files.room().join(".rotation.json"))?)?;
    Ok(marker["stage"].as_str().ok_or("owned pending continuation")?.to_owned())
}

fn retained_stages(files: &super::Files) -> TestResult<BTreeMap<String, Vec<u8>>> {
    Ok(snapshot(files)?.into_iter().filter(|(name, _)| name.starts_with(".stage-")).collect())
}

#[test]
fn full_pending_rotation_recovers_using_only_its_own_continuation_alias() -> TestResult {
    let (files, mut room, profile) = setup()?;
    room.grant("owner", "alice", Some(Role::Editor))?;
    let registered = room.register("alice")?;
    let mut author = profile.join_frame(
        "room".into(),
        registered.lease.writer.clone(),
        &room.catchup("alice")?,
    )?;
    author.apply(vec![Command::InsertText(InsertText {
        block: "p".into(),
        offset: 0,
        text: "Offline during pending rotation ".into(),
    })])?;
    let offline = author.checkpoint()?;
    let expected = room.catchup("owner")?;
    let mut room = retain_interrupted_stages(&files.room(), room, 62)?;
    let retained = room.export_log_generation_backup("owner")?;
    let stage = fill_pending_rotation(&files, room)?;
    let mut stages = retained_stages(&files)?;
    assert_eq!(stages.len(), 64);
    assert_eq!(stages.remove(&stage), Some(Vec::new()));
    let (mut room, recovery) = Room::open_log_generations(&files.room())?;
    assert_eq!(recovery.truncated_bytes, 0);
    assert_eq!(room.catchup("owner")?, expected);
    let receipt = room.rotate_log_generation("owner", "pending")?;
    assert!(receipt.duplicate);
    assert_eq!(room.log_generation_descriptor("owner")?.manifest, receipt.after_manifest);
    assert_eq!(retained_stages(&files)?, stages);
    assert!(!files.room().join(".rotation.json").exists());
    retained.check_retained(&mut room, "owner")?;
    let lease = room.resume("alice", &registered.lease.writer, &registered.credential)?;
    let mut author = profile.restore("room", &offline)?;
    let mut through = send(&mut room, &author, &lease, "0")?;
    for redo in [false, true] {
        assert!(if redo { author.redo()? } else { author.undo()? });
        through = send(&mut room, &author, &lease, &through)?;
        let peer = profile.join_frame("room".into(), "901".into(), &room.catchup("owner")?)?;
        assert_eq!(peer.document_json(), author.document_json());
    }
    Ok(())
}

#[test]
fn full_pending_rotation_resumes_after_retiring_its_alias_and_refuses_when_that_slot_is_lost()
-> TestResult {
    let (files, mut room, _) = setup()?;
    room.grant("owner", "reader", Some(Role::Reader))?;
    let expected = room.catchup("owner")?;
    let room = retain_interrupted_stages(&files.room(), room, 62)?;
    let owned = fill_pending_rotation(&files, room)?;
    let mut stages = retained_stages(&files)?;
    stages.remove(&owned).ok_or("owned continuation before interruption")?;
    let (mut log, records, recovery) = crate::log::Log::open_generations(&files.room())?;
    log.interrupt_rotation_for_test(RotationPoint::FullStageRetired)?;
    assert!(matches!(
        Room::replay_loaded(log, records, recovery, true),
        Err(Error::Contract("test interruption after durable physical prefix"))
    ));
    assert!(files.room().join(".rotation.json").is_file());
    assert_eq!(retained_stages(&files)?, stages);

    // A subsequent unowned stage must not be overwritten or removed to force a retry.
    let unrelated = files.room().join(format!(".stage-{}", crate::credentials::issue()?));
    fs::copy(files.room().join(".head.json"), &unrelated)?;
    let before = snapshot(&files)?;
    assert!(matches!(
        Room::open_log_generations(&files.room()),
        Err(Error::Contract("physical rotation staging capacity"))
    ));
    assert_eq!(snapshot(&files)?, before);
    fs::rename(unrelated, files.recovery())?;

    let (mut room, _) = Room::open_log_generations(&files.room())?;
    assert_eq!(room.catchup("owner")?, expected);
    assert!(room.rotate_log_generation("owner", "pending")?.duplicate);
    assert_eq!(retained_stages(&files)?, stages);
    Ok(())
}

#[test]
fn full_pending_rotation_preserves_an_occupied_unrelated_continuation() -> TestResult {
    use sha2::{Digest, Sha256};
    use std::fmt::Write;
    let (files, mut room, _) = setup()?;
    room.grant("owner", "reader", Some(Role::Reader))?;
    let room = retain_interrupted_stages(&files.room(), room, 62)?;
    fill_pending_rotation(&files, room)?;
    let mut name = "g-".to_owned();
    for byte in Sha256::digest(b"breditor/relay-log-file/1\0pending") {
        write!(name, "{byte:02x}")?;
    }
    let foreign = files.room().join(format!("{name}.wal"));
    let empty = files.room().join(format!(".stage-{}", crate::credentials::issue()?));
    // Give the occupied final path the same empty bytes on a different private inode.
    fs::copy(files.room().join(".head.json"), &empty)?;
    fs::OpenOptions::new().write(true).truncate(true).open(&empty)?;
    fs::rename(empty, foreign)?;
    let before = snapshot(&files)?;
    assert!(matches!(
        Room::open_log_generations(&files.room()),
        Err(Error::Contract("log generation file custody differs"))
    ));
    assert_eq!(snapshot(&files)?, before);
    Ok(())
}

#[test]
fn remaining_file_slots_reach_zero_without_resetting_the_active_wal_budget() -> TestResult {
    let (files, mut room, _) = setup()?;
    let assets = AssetStore::open(&files.recovery(), room.asset_binding())?;
    let initial = room.storage_capacity(&assets, "owner")?;
    let slots = initial.log.rotation.ok_or("generation rotation")?.continuation_files_remaining;
    for number in 0..slots {
        room.grant("owner", "reader", Some(Role::Reader))?;
        room.rotate_log_generation("owner", &format!("capacity-{number}"))?;
    }
    let final_file = room.storage_capacity(&assets, "owner")?;
    let rotation = final_file.log.rotation.ok_or("generation rotation")?;
    assert_eq!(rotation.continuation_files_remaining, 0);
    assert!(!rotation.can_rotate);
    assert!(rotation.staging_available);
    assert!(final_file.log.active.records_remaining > 0);
    assert_eq!(final_file.log.retained.records_remaining, final_file.log.active.records_remaining);
    room.grant("owner", "reader", Some(Role::Reader))?;
    let next = room.storage_capacity(&assets, "owner")?;
    assert_eq!(next.log.active.records_remaining + 1, final_file.log.active.records_remaining);
    assert_eq!(next.log.retained.records_remaining, next.log.active.records_remaining);
    assert_eq!(next.log.retained.framed_bytes_remaining, next.log.active.framed_bytes_remaining);
    let saved = snapshot(&files)?;
    assert!(matches!(
        room.rotate_log_generation("owner", "one-too-many"),
        Err(Error::Contract("physical rotation generation or capacity"))
    ));
    assert_eq!(snapshot(&files)?, saved);
    drop(room);
    let (room, recovery) = Room::open_log_generations(&files.room())?;
    assert_eq!(recovery.truncated_bytes, 0);
    assert_eq!(room.storage_capacity(&assets, "owner")?, next);
    Ok(())
}

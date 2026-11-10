//! Rotation headroom is checked before a new durable prefix can consume it.
use super::{
    Command, Error, InsertText, Role, Room, RotationPoint, TestResult, send, setup, snapshot,
};
use std::{fs, path::Path};

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
    // The continuation and one metadata publication may be staged together.
    assert!(matches!(
        room.rotate_log_generation("owner", "two"),
        Err(Error::Contract("physical rotation staging capacity"))
    ));
    assert_eq!(snapshot(&files)?, before);
    assert_eq!(room.log_generation_descriptor("owner")?, descriptor);
    assert_eq!(room.catchup("owner")?, expected);

    drop(room);
    let (mut room, recovery) = Room::open_log_generations(&files.room())?;
    assert_eq!(recovery.truncated_bytes, 0);
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

#[test]
fn full_pending_rotation_refuses_without_growing_the_inventory() -> TestResult {
    let (files, mut room, _) = setup()?;
    room.grant("owner", "reader", Some(Role::Reader))?;
    let expected = room.catchup("owner")?;
    room = retain_interrupted_stages(&files.room(), room, 62)?;
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
    let before = snapshot(&files)?;
    assert!(matches!(
        Room::open_log_generations(&files.room()),
        Err(Error::Contract("physical rotation staging capacity"))
    ));
    assert_eq!(snapshot(&files)?, before);

    // An explicit fixture-owned archive restores one slot. Recovery consumes
    // only its own continuation and leaves the unrelated bytes available.
    let archived = files.recovery();
    fs::rename(&abandoned, &archived)?;
    let (mut room, _) = Room::open_log_generations(&files.room())?;
    assert_eq!(room.catchup("owner")?, expected);
    assert!(room.rotate_log_generation("owner", "pending")?.duplicate);
    assert_eq!(fs::read(archived)?, before[".head.json"]);
    assert_eq!(snapshot(&files)?.keys().filter(|name| name.starts_with(".stage-")).count(), 62);
    Ok(())
}

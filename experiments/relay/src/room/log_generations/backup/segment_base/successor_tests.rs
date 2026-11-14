use super::{RelaySegmentBaseFile, tests::save};
use crate::{
    Admission, Error, Role, Room,
    room::log_generations::tests::{send, setup_profile},
};
use breditor_collab_feasibility::rich_replica::{Command, actions::InsertText};
use std::{fs, io::Write, sync::Arc};

type TestResult = Result<(), Box<dyn std::error::Error>>;

#[test]
fn writable_segment_reopens_and_accepts_offline_edits_at_absolute_positions_past_the_wal_limit()
-> TestResult {
    let (files, mut original, profile) = setup_profile(3, true, true)?;
    let source = files.room();
    let target = files.recovery();
    for i in 2..64 {
        original.grant("owner", "reader", Some(Role::Reader))?;
        original.rotate_log_generation("owner", &format!("file-{i}"))?;
    }
    original.grant("owner", "alice", Some(Role::Editor))?;
    original.enable_document_history_generations("owner", "doc-root".into(), "doc-one".into())?;
    let registration = original.register("alice")?;
    let mut client = profile.join_frame(
        "room".into(),
        registration.lease.writer.clone(),
        &original.catchup("alice")?,
    )?;
    let edit = |text: &str| {
        vec![Command::InsertText(InsertText { block: "p".into(), offset: 0, text: text.into() })]
    };
    client.apply(edit("Accepted "))?;
    let groups: serde_json::Value =
        serde_json::from_str(&client.writer_groups_v2_guarded(&client.observe()?, "0")?)?;
    let frame = groups["groups"][0].as_str().ok_or("first frame")?;
    let Admission::Durable(first) = original.admit("alice", &registration.lease, frame)? else {
        return Err("first receipt missing".into());
    };
    let expected = original.log_generation_descriptor("owner")?;
    assert!(!original.log.storage_capacity()?.rotation.ok_or("file capacity")?.can_rotate);
    let references = original.log_generation_retained_asset_references("owner")?;
    let (_, base) = save(&mut original, source.parent().ok_or("fixture directory")?)?;
    let base = Arc::new(base);
    client.apply(edit("Offline "))?;

    assert!(matches!(
        original.continue_into_relay_segment("alice", &target, base.clone(), "fresh"),
        Err(Error::Permission)
    ));
    assert!(
        original.continue_into_relay_segment("owner", &target, base.clone(), "file-2").is_err()
    );
    assert!(!target.exists());
    let mut room = original.continue_into_relay_segment("owner", &target, base.clone(), "fresh")?;
    assert!(matches!(original.catchup("owner"), Err(Error::NeedsRecovery)));
    assert!(Room::open_log_generations(&target).is_err());
    let descriptor = room.log_generation_descriptor("owner")?;
    assert_eq!(descriptor.root, expected.root);
    assert_eq!(descriptor.next_sequence, expected.next_sequence);
    assert_eq!(descriptor.terminal_digest, expected.terminal_digest);
    assert_eq!(
        room.log.storage_capacity()?.rotation.ok_or("file capacity")?.continuation_files_remaining,
        63
    );
    let retained = room.relay_segment_retained_asset_references("owner")?;
    assert_eq!(references.outcome, retained.outcome);
    assert_eq!(references.sources, retained.sources);
    assert!(room.export_log_generation_backup("owner").is_err());
    assert!(matches!(room.admit("alice", &registration.lease, frame), Err(Error::Lease)));
    let lease = room.resume("alice", &registration.lease.writer, &registration.credential)?;
    let Admission::Durable(duplicate) = room.admit("alice", &lease, frame)? else {
        return Err("original receipt missing".into());
    };
    assert_eq!(duplicate, crate::DurableReceipt { duplicate: true, ..first.clone() });
    let through = send(&mut room, &client, &lease, &first.receipt.through)?;
    assert!(room.rotate_log_generation("owner", "file-2").is_err());
    let sealed = room.rotate_log_generation("owner", "fresh-two")?;
    assert_eq!(sealed.next_sequence.parse::<u64>()?, expected.next_sequence.parse::<u64>()? + 1);
    assert!(client.undo()?);
    let through = send(&mut room, &client, &lease, &through)?;
    let snapshot = room.catchup("owner")?;
    drop(original);
    assert!(Room::open_log_generations(&source).is_err());
    assert!(matches!(
        Room::open_relay_segment_successor(&source, &target, base.clone()),
        Err(Error::Locked)
    ));
    drop(room);

    let (mut room, recovery) = Room::open_relay_segment_successor(&source, &target, base)?;
    assert_eq!(recovery.truncated_bytes, 0);
    assert_eq!(room.catchup("owner")?, snapshot);
    assert!(room.rotate_log_generation("owner", "fresh-two")?.duplicate);
    let lease = room.resume("alice", &registration.lease.writer, &registration.credential)?;
    assert!(client.redo()?);
    send(&mut room, &client, &lease, &through)?;
    assert_eq!(
        profile.join_frame("room".into(), "900".into(), &room.catchup("owner")?)?.document_json(),
        client.document_json()
    );
    Ok(())
}

#[test]
fn writable_segment_refuses_stale_and_copied_sources_and_repairs_only_its_admitted_tail()
-> TestResult {
    let (files, mut original, _) = setup_profile(3, true, true)?;
    let source = files.room();
    let target = files.recovery();
    let parent = source.parent().ok_or("fixture directory")?;
    original.grant("owner", "before", Some(Role::Reader))?;
    let (_, base) = save(&mut original, parent)?;
    original.grant("owner", "advanced", Some(Role::Reader))?;
    assert!(
        original.continue_into_relay_segment("owner", &target, Arc::new(base), "fresh").is_err()
    );
    assert!(!target.exists());
    fs::remove_file(parent.join("base.archive"))?;
    fs::remove_file(parent.join("base.checkpoint"))?;
    let (identity, base) = save(&mut original, parent)?;
    let base = Arc::new(base);
    fs::create_dir(&target)?;
    assert!(original.continue_into_relay_segment("owner", &target, base.clone(), "fresh").is_err());
    original.catchup("advanced")?;
    fs::remove_dir(&target)?;
    let mut room = original.continue_into_relay_segment("owner", &target, base.clone(), "fresh")?;
    room.grant("owner", "in-successor", Some(Role::Reader))?;
    drop(original);
    drop(room);
    let fake = parent.join("other-source");
    let directory = crate::log::generations::GenerationDirectory::create(&fake)?;
    let marker = ".segment-successor.json";
    fs::copy(source.join(marker), fake.join(marker))?;
    drop(directory);
    let wal = target.join(crate::log::generations::test_wal_name("fresh"));
    fs::OpenOptions::new().append(true).open(&wal)?.write_all(&[0; 8])?;
    let tail = fs::read(&wal)?;
    assert!(Room::open_relay_segment_successor(&fake, &target, base.clone()).is_err());
    assert_eq!(fs::read(&wal)?, tail);
    let (room, recovery) = Room::open_relay_segment_successor(&source, &target, base)?;
    assert_eq!(recovery.truncated_bytes, 8);
    room.catchup("in-successor")?;
    let checkpoint = parent.join("base.checkpoint");
    let mut bytes = fs::read(&checkpoint)?;
    bytes[0] ^= 1;
    fs::write(&checkpoint, bytes)?;
    assert!(room.catchup("owner").is_err());
    assert!(
        RelaySegmentBaseFile::open(
            fs::File::open(parent.join("base.archive"))?,
            fs::File::open(checkpoint)?,
            &identity
        )
        .is_err()
    );
    Ok(())
}

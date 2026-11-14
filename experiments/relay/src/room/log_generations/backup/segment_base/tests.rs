use super::{RelaySegmentBaseFile, RelaySegmentBaseIdentity};
use crate::{
    Admission, Error, Role, Room, ServerNativeHistoryLane,
    log::generations::test_wal_name,
    room::log_generations::tests::{send, setup_profile},
};
use breditor_collab_feasibility::rich_replica::{Command, actions::InsertText};
use std::{
    fs::{self, File},
    io::{self, Write},
    path::Path,
};

type TestResult<T = ()> = Result<T, Box<dyn std::error::Error>>;

pub(super) fn save(
    room: &mut Room,
    parent: &Path,
) -> TestResult<(RelaySegmentBaseIdentity, RelaySegmentBaseFile)> {
    let archive = parent.join("base.archive");
    let checkpoint = parent.join("base.checkpoint");
    let identity = {
        let mut archive = File::create_new(&archive)?;
        let mut checkpoint = File::create_new(&checkpoint)?;
        let identity = room.write_relay_segment_base("owner", &mut archive, &mut checkpoint)?;
        archive.sync_all()?;
        checkpoint.sync_all()?;
        identity
    };
    let base =
        RelaySegmentBaseFile::open(File::open(archive)?, File::open(checkpoint)?, &identity)?;
    Ok((identity, base))
}

#[test]
fn segment_base_at_file_limit_preserves_global_receipts_and_replays_active_suffix() -> TestResult {
    let (files, mut room, profile) = setup_profile(3, true, true)?;
    let path = files.room();
    let parent = path.parent().ok_or("fixture parent")?;
    for i in 2..64 {
        room.grant("owner", "temporary", Some(Role::Reader))?;
        room.rotate_log_generation("owner", &format!("file-{i}"))?;
        room.grant("owner", "temporary", None)?;
    }
    room.grant("owner", "alice", Some(Role::Editor))?;
    room.enable_document_history_generations("owner", "doc-root".into(), "doc-v1".into())?;
    let registration = room.register("alice")?;
    let mut writer = profile.join_frame(
        "room".into(),
        registration.lease.writer.clone(),
        &room.catchup("owner")?,
    )?;
    writer.apply(vec![Command::InsertText(InsertText {
        block: "p".into(),
        offset: 0,
        text: "At the limit ".into(),
    })])?;
    let groups: serde_json::Value =
        serde_json::from_str(&writer.writer_groups_v2_guarded(&writer.observe()?, "0")?)?;
    let frame = groups["groups"][0].as_str().ok_or("first frame")?;
    let Admission::Durable(first) = room.admit("alice", &registration.lease, frame)? else {
        return Err("missing receipt".into());
    };
    assert!(room.rotate_log_generation("owner", "would-be-file-65").is_err());
    assert!(room.materialize_relay_checkpoint("owner").is_err());
    assert!(matches!(
        room.write_relay_segment_base("alice", &mut io::sink(), &mut io::sink()),
        Err(Error::Permission)
    ));
    let (identity, base) = save(&mut room, parent)?;
    let old_archive = room.export_log_generation_backup("owner")?;
    assert_eq!(&old_archive.info().identity, &identity.predecessor);
    assert_eq!(base.identity(), &identity);

    room.continue_document_native_history("owner", "doc-v2".into())?;
    room.grant("owner", "after-the-base", Some(Role::Reader))?;
    writer.apply(vec![Command::InsertText(InsertText {
        block: "p".into(),
        offset: 0,
        text: "Offline ".into(),
    })])?;
    drop(room);
    let (mut ordinary, report) = Room::open_log_generations(&path)?;
    assert_eq!(report.truncated_bytes, 0);
    let expected =
        ordinary.native_history_checkpoint("owner", ServerNativeHistoryLane::Document)?;
    let archive = ordinary.export_log_generation_backup("owner")?.to_bytes();
    drop(ordinary);

    let mut room = Room::open_log_generations_with_segment_base(&path, &base)?;
    assert_eq!(
        room.native_history_checkpoint("owner", ServerNativeHistoryLane::Document)?,
        expected
    );
    assert_eq!(room.export_log_generation_backup("owner")?.to_bytes(), archive);
    assert!(room.catchup("after-the-base").is_ok());
    assert!(matches!(room.admit("alice", &registration.lease, frame), Err(Error::Lease)));
    let lease = room.resume("alice", &registration.lease.writer, &registration.credential)?;
    let Admission::Durable(retry) = room.admit("alice", &lease, frame)? else {
        return Err("missing retry receipt".into());
    };
    assert_eq!(retry, crate::DurableReceipt { duplicate: true, ..first.clone() });
    let through = send(&mut room, &writer, &lease, &first.receipt.through)?;
    assert!(writer.undo()?);
    let through = send(&mut room, &writer, &lease, &through)?;
    assert!(writer.redo()?);
    send(&mut room, &writer, &lease, &through)?;
    assert_eq!(
        profile.join_frame("room".into(), "900".into(), &room.catchup("owner")?)?.document_json(),
        writer.document_json()
    );
    Ok(())
}

#[test]
fn segment_base_replays_after_its_active_wal_is_sealed_and_packed() -> TestResult {
    let (files, mut room, _) = setup_profile(3, true, true)?;
    let path = files.room();
    let parent = path.parent().ok_or("fixture parent")?;
    room.grant("owner", "before-base", Some(Role::Reader))?;
    let (_, base) = save(&mut room, parent)?;
    room.grant("owner", "after-base", Some(Role::Reader))?;
    room.rotate_log_generation("owner", "two")?;
    room.pack_sealed_wal("owner", "one")?;
    room.grant("owner", "active-reader", Some(Role::Reader))?;
    let expected = room.export_log_generation_backup("owner")?.info();
    drop(room);
    let mut room = Room::open_log_generations_with_segment_base(&path, &base)?;
    for principal in ["before-base", "after-base", "active-reader"] {
        room.catchup(principal)?;
    }
    assert_eq!(room.export_log_generation_backup("owner")?.info(), expected);
    Ok(())
}

#[test]
fn segment_base_rejects_forked_cut_changed_files_and_torn_tail_without_owning_them() -> TestResult {
    let (files, mut room, _) = setup_profile(3, true, true)?;
    let path = files.room();
    let parent = path.parent().ok_or("fixture parent")?;
    room.grant("owner", "before-base", Some(Role::Reader))?;
    let (identity, base) = save(&mut room, parent)?;
    let (foreign, mut fork, _) = setup_profile(3, true, true)?;
    fork.grant("owner", "other-readr", Some(Role::Reader))?;
    drop(fork);
    assert!(Room::open_log_generations_with_segment_base(&foreign.room(), &base).is_err());
    let mut wrong = identity.clone();
    wrong.checkpoint.manifest[0] ^= 1;
    let archive = parent.join("base.archive");
    let checkpoint = parent.join("base.checkpoint");
    assert!(
        RelaySegmentBaseFile::open(File::open(&archive)?, File::open(&checkpoint)?, &wrong)
            .is_err()
    );
    drop(room);
    let wal = path.join(test_wal_name("one"));
    fs::OpenOptions::new().append(true).open(&wal)?.write_all(&[0; 12])?;
    let tail = fs::read(&wal)?;
    assert!(Room::open_log_generations_with_segment_base(&path, &base).is_err());
    assert_eq!(fs::read(&wal)?, tail);
    let (_, repair) = Room::open_log_generations(&path)?;
    assert_eq!(repair.truncated_bytes, 12);

    let mut bytes = fs::read(&checkpoint)?;
    bytes[0] ^= 1;
    fs::write(&checkpoint, bytes)?;
    assert!(Room::open_log_generations_with_segment_base(&path, &base).is_err());
    assert!(
        RelaySegmentBaseFile::open(File::open(&archive)?, File::open(&checkpoint)?, &identity)
            .is_err()
    );
    Ok(())
}

#[test]
fn segment_base_checkpoint_output_failure_preserves_append_cursor() -> TestResult {
    struct Refuse;
    impl Write for Refuse {
        fn write(&mut self, _: &[u8]) -> io::Result<usize> {
            Err(io::Error::other("destination refused checkpoint"))
        }
        fn flush(&mut self) -> io::Result<()> {
            Ok(())
        }
    }
    let (files, mut room, _) = setup_profile(3, true, true)?;
    room.grant("owner", "before-base", Some(Role::Reader))?;
    let before = room.export_log_generation_backup("owner")?;
    assert!(room.write_relay_segment_base("owner", &mut io::sink(), &mut Refuse).is_err());
    before.check_live(&mut room, "owner")?;
    room.grant("owner", "after-failure", Some(Role::Reader))?;
    drop(room);
    let (room, _) = Room::open_log_generations(&files.room())?;
    room.catchup("after-failure")?;
    Ok(())
}

#[test]
fn segment_base_checks_the_predecessor_after_the_checkpoint_destination_runs() -> TestResult {
    struct ChangeStage {
        path: std::path::PathBuf,
    }
    impl Write for ChangeStage {
        fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
            fs::write(&self.path, b"changed unpublished stage")?;
            Err(io::Error::other(format!("destination refused {} bytes", bytes.len())))
        }
        fn flush(&mut self) -> io::Result<()> {
            Ok(())
        }
    }

    let (files, mut room, _) = setup_profile(3, true, true)?;
    let path = files.room().join(format!(".stage-{}", crate::credentials::issue()?));
    {
        use std::os::unix::fs::OpenOptionsExt;
        fs::OpenOptions::new().write(true).create_new(true).mode(0o600).open(&path)?;
    }
    let mut destination = ChangeStage { path };
    assert!(room.write_relay_segment_base("owner", &mut io::sink(), &mut destination).is_err());
    assert!(matches!(room.catchup("owner"), Err(Error::NeedsRecovery)));
    Ok(())
}

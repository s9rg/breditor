//! Actual WAL replacement, archive compatibility, cold replay and old client delivery.
use super::{TestResult, send, setup, snapshot, torn_header};
use crate::{Error, Role, Room};
use breditor_collab_feasibility::rich_replica::{Command, actions::InsertText};
use std::fs;

#[test]
fn sealed_wal_packing_reclaims_bytes_preserves_the_exact_backup_and_accepts_old_offline_undo()
-> TestResult {
    let (files, mut room, profile) = setup()?;
    room.grant("owner", "alice", Some(Role::Editor))?;
    let registration = room.register("alice")?;
    let mut author = profile.join_frame(
        "room".into(),
        registration.lease.writer.clone(),
        &room.catchup("alice")?,
    )?;
    author.apply(vec![Command::InsertText(InsertText {
        block: "p".into(),
        offset: 0,
        text: "Retained before packing ".repeat(24),
    })])?;
    let mut through = send(&mut room, &author, &registration.lease, "0")?;
    let predecessor = room.export_log_generation_backup("owner")?;
    room.rotate_log_generation("owner", "two")?;
    author.apply(vec![Command::InsertText(InsertText {
        block: "p".into(),
        offset: 0,
        text: "Offline before packing ".into(),
    })])?;
    let expected = room.export_log_generation_backup("owner")?;
    let cut = room.log_generation_descriptor("owner")?;
    let raw = snapshot(&files)?;
    assert!(matches!(room.pack_sealed_wal("alice", "one"), Err(Error::Permission)));
    assert!(room.pack_sealed_wal("owner", "two").is_err());
    assert_eq!(snapshot(&files)?, raw);
    let pack = room.pack_sealed_wal("owner", "one")?;
    assert!(pack.packed && pack.stored_bytes < pack.original_bytes);
    let packed = snapshot(&files)?;
    let changed: Vec<_> =
        raw.iter().filter(|(name, before)| packed.get(*name) != Some(*before)).collect();
    assert_eq!(changed.len(), 1);
    let (name, original) = changed[0];
    assert_eq!(original.len() as u64, pack.original_bytes);
    assert_eq!(packed[name].len() as u64, pack.stored_bytes);
    assert_eq!(room.pack_sealed_wal("owner", "one")?, pack);
    assert_eq!(snapshot(&files)?, packed);
    assert_eq!(room.log_generation_descriptor("owner")?, cut);
    assert_eq!(room.export_log_generation_backup("owner")?.to_bytes(), expected.to_bytes());
    expected.check_live(&mut room, "owner")?;
    predecessor.check_retained(&mut room, "owner")?;
    drop(room);

    let (mut room, recovery) = Room::open_log_generations(&files.room())?;
    assert_eq!(recovery.truncated_bytes, 0);
    assert_eq!(room.pack_sealed_wal("owner", "one")?, pack);
    expected.check_live(&mut room, "owner")?;
    predecessor.check_retained(&mut room, "owner")?;
    let lease = room.resume("alice", &registration.lease.writer, &registration.credential)?;
    through = send(&mut room, &author, &lease, &through)?;
    for redo in [false, true] {
        assert!(if redo { author.redo()? } else { author.undo()? });
        through = send(&mut room, &author, &lease, &through)?;
        let observer = profile.join_frame("room".into(), "901".into(), &room.catchup("owner")?)?;
        assert_eq!(observer.document_json(), author.document_json());
    }
    room.rotate_log_generation("owner", "three")?;
    drop(room);
    let (mut room, _) = Room::open_log_generations(&files.room())?;
    predecessor.check_retained(&mut room, "owner")?;
    Ok(())
}

#[test]
fn corrupt_packed_wal_refuses_before_any_active_tail_repair() -> TestResult {
    let (files, mut room, _) = setup()?;
    room.grant("owner", "reader", Some(Role::Reader))?;
    room.rotate_log_generation("owner", "two")?;
    assert!(room.pack_sealed_wal("owner", "root")?.packed);
    let (name, mut bytes) = snapshot(&files)?
        .into_iter()
        .find(|(_, bytes)| bytes.starts_with(b"BRWALGZ1"))
        .ok_or("packed file")?;
    drop(room);
    torn_header(&files)?;
    let last = bytes.len() - 1;
    bytes[last] ^= 1;
    fs::write(files.room().join(name), bytes)?;
    let before = snapshot(&files)?;
    assert!(Room::open_log_generations(&files.room()).is_err());
    assert_eq!(snapshot(&files)?, before);
    Ok(())
}

#[test]
fn packed_wal_interrupted_before_or_after_rename_reopens_with_the_same_portable_cut() -> TestResult
{
    use crate::log::generations::WalPackingInterruption as Stop;
    for stop in [Stop::BeforeRename, Stop::AfterSync] {
        let (files, mut room, _) = setup()?;
        let expected = room.export_log_generation_backup("owner")?;
        assert!(matches!(room.log.interrupt_wal_packing("root", stop), Err(Error::NeedsRecovery)));
        assert!(matches!(room.catchup("owner"), Err(Error::NeedsRecovery)));
        drop(room);
        let (mut room, recovery) = Room::open_log_generations(&files.room())?;
        assert_eq!(recovery.truncated_bytes, 0);
        expected.check_live(&mut room, "owner")?;
        assert_eq!(room.export_log_generation_backup("owner")?.to_bytes(), expected.to_bytes());
        let entries = snapshot(&files)?;
        assert_eq!(
            entries.keys().filter(|name| name.starts_with(".pack-wal-")).count(),
            usize::from(stop == Stop::BeforeRename)
        );
        assert!(room.pack_sealed_wal("owner", "root")?.packed);
        assert_eq!(room.export_log_generation_backup("owner")?.to_bytes(), expected.to_bytes());
        assert!(!snapshot(&files)?.keys().any(|name| name.starts_with(".pack-wal-")));
    }
    Ok(())
}

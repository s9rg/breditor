//! Exercise actual archive names, interruption points and portable backup bytes.
use super::{TestResult, setup};
use crate::{
    Error, Role, Room,
    log::generations::{WalArchiveInterruption as Stop, test_wal_name},
};
use std::{fs, os::unix::fs::MetadataExt};

#[test]
fn sealed_wal_archive_preserves_original_bytes_and_rejects_generations_beyond_its_cut() -> TestResult
{
    let (files, mut room, _) = setup()?;
    room.grant("owner", "reader", Some(Role::Reader))?;
    let predecessor = room.export_log_generation_backup("owner")?;
    room.rotate_log_generation("owner", "two")?;
    let checkpoint = room.materialize_relay_checkpoint("owner")?;
    room.grant("owner", "later-reader", Some(Role::Reader))?;
    room.rotate_log_generation("owner", "three")?;
    let expected = room.export_log_generation_backup("owner")?;
    let directory = files.room();
    let name = test_wal_name("root");
    let live = directory.join(&name);
    let archive = directory.join(".sealed-wals");
    let archived = archive.join(name);
    let original = fs::read(&live)?;
    let inode = fs::metadata(&live)?.ino();

    assert!(matches!(
        room.archive_sealed_wal("reader", &checkpoint, "root"),
        Err(Error::Permission)
    ));
    assert!(room.archive_sealed_wal("owner", &checkpoint, "two").is_err());
    assert!(room.archive_sealed_wal("owner", &checkpoint, "three").is_err());
    assert!(!archive.exists());
    let receipt = room.archive_sealed_wal("owner", &checkpoint, "root")?;
    assert_eq!(receipt.generation, "root");
    assert_eq!(receipt.stored_bytes, original.len() as u64);
    assert!(!receipt.duplicate);
    assert!(!live.exists());
    assert_eq!(fs::metadata(&archived)?.ino(), inode);
    assert_eq!(fs::read(&archived)?, original);
    assert!(room.pack_sealed_wal("owner", "root").is_err());
    expected.check_live(&mut room, "owner")?;
    predecessor.check_retained(&mut room, "owner")?;
    assert_eq!(room.export_log_generation_backup("owner")?.to_bytes(), expected.to_bytes());
    drop(room);

    let (mut room, recovery) = Room::open_log_generations(&directory)?;
    assert_eq!(recovery.truncated_bytes, 0);
    assert!(room.archive_sealed_wal("owner", &checkpoint, "root")?.duplicate);
    expected.check_live(&mut room, "owner")?;
    room.grant("owner", "after-archive", Some(Role::Reader))?;
    room.rotate_log_generation("owner", "four")?;
    predecessor.check_retained(&mut room, "owner")?;
    Ok(())
}

#[test]
fn sealed_wal_archive_interruption_keeps_the_original_inode_and_exact_cut() -> TestResult {
    for stop in [Stop::Linked, Stop::Retired] {
        let (files, mut room, _) = setup()?;
        let checkpoint = room.materialize_relay_checkpoint("owner")?;
        let expected = room.export_log_generation_backup("owner")?;
        let name = test_wal_name("root");
        let live = files.room().join(&name);
        let archived = files.room().join(".sealed-wals").join(name);
        let inode = fs::metadata(&live)?.ino();
        assert!(matches!(
            room.log.interrupt_wal_archive("root", checkpoint.identity().source.records, stop),
            Err(Error::NeedsRecovery)
        ));
        assert!(matches!(room.catchup("owner"), Err(Error::NeedsRecovery)));
        drop(room);

        assert_eq!(live.exists(), stop == Stop::Linked);
        if stop == Stop::Linked {
            assert_eq!(fs::metadata(&live)?.ino(), inode);
        }
        assert_eq!(fs::metadata(&archived)?.ino(), inode);
        let mut room = Room::open_log_generations_with_checkpoint(&files.room(), &checkpoint)?;
        expected.check_live(&mut room, "owner")?;
        assert!(room.archive_sealed_wal("owner", &checkpoint, "root")?.duplicate);
        assert!(!live.exists());
        assert_eq!(room.export_log_generation_backup("owner")?.to_bytes(), expected.to_bytes());
    }
    Ok(())
}

#[test]
fn sealed_wal_archive_refuses_divergent_names_and_changed_bytes_before_repairing_the_tail()
-> TestResult {
    use std::os::unix::fs::PermissionsExt;

    let (files, mut room, _) = setup()?;
    let checkpoint = room.materialize_relay_checkpoint("owner")?;
    room.archive_sealed_wal("owner", &checkpoint, "root")?;
    drop(room);

    let name = test_wal_name("root");
    let live = files.room().join(&name);
    let archived = files.room().join(".sealed-wals").join(name);
    let active = files.room().join(test_wal_name("one"));
    super::torn_header(&files)?;
    let tail = fs::read(&active)?;
    let original = fs::read(&archived)?;
    fs::copy(&archived, &live)?;
    fs::set_permissions(&live, fs::Permissions::from_mode(0o600))?;
    assert_ne!(fs::metadata(&live)?.ino(), fs::metadata(&archived)?.ino());
    assert!(Room::open_log_generations(&files.room()).is_err());
    assert_eq!(fs::read(&live)?, original);
    assert_eq!(fs::read(&active)?, tail);

    fs::remove_file(live)?;
    let mut corrupt = original;
    corrupt[0] ^= 1;
    fs::write(&archived, &corrupt)?;
    assert!(Room::open_log_generations(&files.room()).is_err());
    assert_eq!(fs::read(&archived)?, corrupt);
    assert_eq!(fs::read(&active)?, tail);
    Ok(())
}

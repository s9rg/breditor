//! Explicit opt-in test using a disposable, unmounted APFS sparse image.
use super::{TestResult, setup};
use crate::{
    Error, Role, Room,
    log::generations::{WalArchiveInterruption as Stop, test_wal_name},
};
use std::{
    env, fs,
    os::unix::fs::{DirBuilderExt, MetadataExt},
    path::Path,
    process::Command,
};

struct Mounted<'a>(&'a Path);
impl<'a> Mounted<'a> {
    fn attach(path: &'a Path) -> TestResult<Self> {
        let image = env::var_os("BREDITOR_TEST_ARCHIVE_IMAGE")
            .ok_or("set BREDITOR_TEST_ARCHIVE_IMAGE to a dedicated, unmounted APFS image")?;
        fs::create_dir(path)?;
        let status = Command::new("/usr/bin/hdiutil")
            .args(["attach", "-nobrowse", "-owners", "on", "-mountpoint"])
            .arg(path)
            .arg(image)
            .status()?;
        assert!(status.success(), "mount the disposable archive volume");
        Ok(Self(path))
    }
}
impl Drop for Mounted<'_> {
    fn drop(&mut self) {
        let _ = Command::new("/usr/bin/hdiutil").arg("detach").arg(self.0).status();
    }
}

#[test]
#[ignore = "requires a dedicated unmounted APFS image and mount permission"]
fn real_cross_volume_wal_archive_retries_each_interruption_and_keeps_the_original_cut() -> TestResult
{
    for (index, stop) in [Stop::CopySynced, Stop::Linked, Stop::Retired].into_iter().enumerate() {
        let (files, mut room, _) = setup()?;
        room.grant("owner", "reader", Some(Role::Reader))?;
        room.rotate_log_generation("owner", "two")?;
        let checkpoint = room.materialize_relay_checkpoint("owner")?;
        let expected = room.export_log_generation_backup("owner")?;
        let mount = files.room().join(".sealed-wal-volume");
        let archive = mount.join("archive");
        let live = files.room().join(test_wal_name("root"));
        let target = archive.join(test_wal_name("root"));
        let stored = fs::read(&live)?;
        drop(room);
        let mounted = Mounted::attach(&mount)?;
        if !archive.exists() {
            fs::DirBuilder::new().mode(0o700).create(&archive)?;
        }
        assert_ne!(fs::metadata(files.room())?.dev(), fs::metadata(&archive)?.dev());
        assert!(fs::read_dir(&archive)?.next().is_none());
        let mut room = Room::open_log_generations_with_checkpoint(&files.room(), &checkpoint)?;
        assert!(matches!(
            room.log.interrupt_wal_archive("root", checkpoint.identity().source.records, stop),
            Err(Error::NeedsRecovery)
        ));
        assert!(matches!(room.catchup("owner"), Err(Error::NeedsRecovery)));
        drop(room);
        assert_eq!(live.exists(), stop != Stop::Retired);
        assert_eq!(target.exists(), stop != Stop::CopySynced);
        if live.exists() {
            assert_eq!(fs::read(&live)?, stored);
        }
        if target.exists() {
            assert_eq!(fs::read(&target)?, stored);
        }
        let mut room = Room::open_log_generations_with_checkpoint(&files.room(), &checkpoint)?;
        expected.check_live(&mut room, "owner")?;
        let moved = room.archive_sealed_wal("owner", &checkpoint, "root")?;
        assert_eq!(moved.duplicate, stop != Stop::CopySynced);
        assert_eq!(moved.stored_bytes, stored.len() as u64);
        assert!(!live.exists());
        assert_eq!(fs::read(&target)?, stored);
        assert_eq!(room.export_log_generation_backup("owner")?.to_bytes(), expected.to_bytes());
        drop(room);
        let (mut reopened, _) = Room::open_log_generations(&files.room())?;
        expected.check_live(&mut reopened, "owner")?;
        drop(reopened);
        // This archive is dedicated to this test and reused for the next interruption.
        fs::remove_file(target)?;
        for entry in fs::read_dir(&archive)? {
            let entry = entry?;
            if entry.file_name().to_string_lossy().starts_with(".offload-") {
                assert_eq!(index, 0);
                fs::remove_file(entry.path())?;
            }
        }
        drop(mounted);
        assert!(matches!(
            Room::open_log_generations_with_checkpoint(&files.room(), &checkpoint),
            Err(Error::Contract("sealed WAL archive volume is not mounted"))
        ));
    }
    Ok(())
}

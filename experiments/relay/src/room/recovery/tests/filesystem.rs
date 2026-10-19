use super::*;
#[test]
fn occupied_destinations_and_ambiguous_names_are_not_adopted() -> TestResult {
    for kind in ["file", "empty", "populated"] {
        let directory = Directory::new()?;
        let backup = backup(&directory)?;
        let root = directory.path("restored");
        if kind == "file" {
            fs::write(&root, b"host data")?;
        } else {
            fs::create_dir(&root)?;
            if kind == "populated" {
                fs::write(root.join("host-notes"), b"host data")?;
            }
        }
        assert!(begin(&directory, &backup).is_err());
        if kind == "file" {
            assert_eq!(fs::read(root)?, b"host data");
        } else if kind == "populated" {
            assert_eq!(fs::read(root.join("host-notes"))?, b"host data");
        } else {
            assert_eq!(fs::read_dir(root)?.count(), 0);
        }
    }
    let directory = Directory::new()?;
    let backup = backup(&directory)?;
    for name in [".", "..", "new/.", "new/..", "new/"] {
        assert!(
            ServerRoomRecovery::begin(&directory.path(name), &backup, &backup.identity, POLICY)
                .is_err()
        );
    }
    assert!(!directory.path("new").exists());
    Ok(())
}
#[cfg(unix)]
#[test]
fn symlink_targets_are_not_followed_and_parent_alias_changes_do_not_redirect_an_owner() -> TestResult
{
    use std::os::unix::fs::symlink;
    let directory = Directory::new()?;
    let backup = backup(&directory)?;
    for target in [directory.path("source-assets"), directory.path("missing")] {
        symlink(&target, directory.path("restored"))?;
        assert!(begin(&directory, &backup).is_err());
        assert!(resume(&directory, &backup).is_err());
        assert_eq!(fs::read_link(directory.path("restored"))?, target);
        fs::remove_file(directory.path("restored"))?;
    }
    let alias = directory.path("alias");
    symlink(&directory.0, &alias)?;
    let attempt =
        ServerRoomRecovery::begin(&alias.join("restored"), &backup, &backup.identity, POLICY)?;
    let foreign = directory.path("foreign");
    fs::create_dir(&foreign)?;
    fs::remove_file(&alias)?;
    symlink(&foreign, &alias)?;
    drop(attempt.finish(&backup)?);
    assert!(directory.path("restored/.ready.json").is_file());
    assert_eq!(fs::read_dir(foreign)?.count(), 0);
    Ok(())
}
#[test]
fn concurrent_reservations_and_resumptions_keep_one_exclusive_owner() -> TestResult {
    let directory = Directory::new()?;
    let backup = backup(&directory)?;
    let path = directory.path("restored");
    for operation in ["begin", "resume"] {
        let start = std::sync::Barrier::new(2);
        let hold = std::sync::Barrier::new(2);
        let count = std::thread::scope(|scope| {
            let run = || {
                start.wait();
                let result = if operation == "begin" {
                    ServerRoomRecovery::begin(&path, &backup, &backup.identity, POLICY)
                } else {
                    ServerRoomRecovery::resume(&path, &backup, &backup.identity, POLICY)
                };
                hold.wait();
                result.is_ok()
            };
            let a = scope.spawn(run);
            let b = scope.spawn(run);
            Ok::<_, Box<dyn std::error::Error>>(
                usize::from(a.join().map_err(|_| "first thread")?)
                    + usize::from(b.join().map_err(|_| "second thread")?),
            )
        })?;
        assert_eq!(count, 1, "{operation}");
    }
    drop(resume(&directory, &backup)?.finish(&backup)?);
    Ok(())
}
#[cfg(unix)]
#[test]
fn private_modes_and_live_coordinator_lock_inode_are_checked() -> TestResult {
    use std::os::unix::fs::PermissionsExt;
    let directory = Directory::new()?;
    let backup = backup(&directory)?;
    let attempt = begin(&directory, &backup)?;
    assert_eq!(fs::metadata(attempt.root())?.permissions().mode() & 0o777, 0o700);
    for name in [".lock", ".recovery.json"] {
        assert_eq!(fs::metadata(attempt.root().join(name))?.permissions().mode() & 0o777, 0o600);
    }
    fs::rename(attempt.root().join(".lock"), directory.path("held-lock"))?;
    fs::write(attempt.root().join(".lock"), [])?;
    assert!(attempt.progress(&backup).is_err());
    assert!(attempt.finish(&backup).is_err());
    assert!(!directory.path("restored/.ready.json").exists());
    Ok(())
}

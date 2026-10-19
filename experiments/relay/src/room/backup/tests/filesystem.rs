use super::*;
use std::io::Write;

#[test]
fn occupied_files_directories_and_live_source_are_never_replaced() -> TestResult {
    let directory = Directory::new()?;
    let (_, mut source) = start(&directory, 1, false, false)?;
    let archive = source.export_backup()?;
    let identity = source.backup_identity()?;
    let original = fs::read(directory.path("source.log"))?;
    fs::write(directory.path("occupied.log"), b"unrecognized retained data")?;
    fs::create_dir(directory.path("occupied-dir"))?;
    for name in ["source.log", "occupied.log", "occupied-dir"] {
        assert!(matches!(
            Room::restore_backup(
                &directory.path(name),
                &archive,
                &identity,
                RoomRecoveryPolicy::HostReacquired
            ),
            Err(Error::Contract("room backup destination exists"))
        ));
    }
    assert_eq!(fs::read(directory.path("occupied.log"))?, b"unrecognized retained data");
    assert_eq!(fs::read(directory.path("source.log"))?, original);
    assert_eq!(directory.names()?, vec!["occupied-dir", "occupied.log", "source.log"]);
    Ok(())
}

#[test]
fn racing_restore_attempts_have_one_winner_and_leave_no_staging_names() -> TestResult {
    let directory = Directory::new()?;
    let (_, mut source) = start(&directory, 3, true, true)?;
    let bytes = fs::read(directory.path("source.log"))?;
    let archive = source.export_backup()?;
    let identity = source.backup_identity()?;
    drop(source);
    let barrier = std::sync::Barrier::new(2);
    let destination = directory.path("target.log");
    let winners = std::thread::scope(|scope| {
        let tasks = (0..2)
            .map(|_| {
                scope.spawn(|| {
                    barrier.wait();
                    Room::restore_backup(
                        &destination,
                        &archive,
                        &identity,
                        RoomRecoveryPolicy::HostReacquired,
                    )
                    .is_ok()
                })
            })
            .collect::<Vec<_>>();
        tasks.into_iter().map(|task| task.join().expect("restore thread")).filter(|v| *v).count()
    });
    assert_eq!(winners, 1);
    assert_eq!(fs::read(&destination)?, bytes);
    assert_eq!(directory.names()?, vec!["source.log", "target.log"]);
    assert_eq!(Room::open(&destination)?.1.truncated_bytes, 0);
    Ok(())
}

#[cfg(unix)]
#[test]
fn dangling_and_live_symlinks_are_occupied_and_published_files_stay_private() -> TestResult {
    use std::os::unix::fs::{PermissionsExt, symlink};
    let directory = Directory::new()?;
    let (_, mut source) = start(&directory, 1, false, false)?;
    let archive = source.export_backup()?;
    let identity = source.backup_identity()?;
    drop(source);
    symlink(directory.path("absent"), directory.path("dangling.log"))?;
    symlink(directory.path("source.log"), directory.path("link.log"))?;
    for name in ["dangling.log", "link.log"] {
        assert!(
            Room::restore_backup(
                &directory.path(name),
                &archive,
                &identity,
                RoomRecoveryPolicy::HostReacquired
            )
            .is_err()
        );
        assert!(fs::symlink_metadata(directory.path(name))?.is_symlink());
    }
    let restored = Room::restore_backup(
        &directory.path("target.log"),
        &archive,
        &identity,
        RoomRecoveryPolicy::HostReacquired,
    )?;
    assert_eq!(fs::metadata(directory.path("target.log"))?.permissions().mode() & 0o777, 0o600);
    assert!(matches!(Room::open(&directory.path("target.log")), Err(Error::Locked)));
    drop(restored);
    Ok(())
}

#[test]
fn uncertain_or_externally_modified_live_logs_cannot_export_a_false_complete_snapshot() -> TestResult
{
    let directory = Directory::new()?;
    let (_, mut source) = start(&directory, 1, false, false)?;
    let path = directory.path("source.log");
    let before = fs::read(&path)?;
    fs::OpenOptions::new().append(true).open(&path)?.write_all(&[1, 2, 3])?;
    assert!(source.export_backup().is_err());
    assert!(matches!(source.export_backup(), Err(Error::NeedsRecovery)));
    assert!(matches!(source.backup_identity(), Err(Error::NeedsRecovery)));
    assert!(matches!(
        source.grant("owner", "alice", Some(crate::Role::Editor)),
        Err(Error::NeedsRecovery)
    ));
    assert_eq!(fs::read(&path)?, [before.clone(), vec![1, 2, 3]].concat());
    drop(source);
    let (mut source, recovery) = Room::open(&path)?;
    assert_eq!(recovery.truncated_bytes, 3);
    assert_eq!(fs::read(&path)?, before);
    source.log.use_read_only_handle_for_test(&path)?;
    assert!(source.grant("owner", "alice", Some(crate::Role::Editor)).is_err());
    assert!(matches!(source.export_backup(), Err(Error::NeedsRecovery)));
    Ok(())
}

#[test]
fn same_length_alternate_complete_lineage_is_not_the_live_room_snapshot() -> TestResult {
    use crate::log::{Event, Log};
    let directory = Directory::new()?;
    let (_, mut source) = start(&directory, 1, false, false)?;
    let (_, configuration, document) = seed(1, false)?;
    let profile = SharedRichProfile::from_configuration_json(&configuration)?;
    drop(Log::create(
        &directory.path("other.log"),
        Event::Seed {
            configuration,
            room: "room".into(),
            owner: "other".into(),
            journal: profile.create(&document, "1".into())?.checkpoint()?,
        },
    )?);
    let alternate = fs::read(directory.path("other.log"))?;
    assert_eq!(fs::metadata(directory.path("source.log"))?.len(), u64::try_from(alternate.len())?);
    fs::write(directory.path("source.log"), &alternate)?;
    assert!(matches!(
        source.export_backup(),
        Err(Error::Contract("live log lineage changed outside authority"))
    ));
    assert!(matches!(source.export_backup(), Err(Error::NeedsRecovery)));
    assert_eq!(fs::read(directory.path("source.log"))?, alternate);
    Ok(())
}

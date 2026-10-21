//! Actual durable restore prefixes, inode conflicts and native proof barriers.
use super::super::{
    ServerLogGenerationBackup,
    tests::{self as fixture, Files},
};
use super::{ServerLogGenerationRecovery, files, interruption::RestorePoint, types::Component};
use crate::{Registration, Role, Room, RoomRecoveryPolicy};
use breditor_collab_feasibility::rich_replica::{
    Command, RichReplica, SharedRichProfile, actions::InsertText,
};
use std::{collections::BTreeMap, fs, path::Path};
type TestResult<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;

struct Source {
    files: Files,
    profile: SharedRichProfile,
    author: Registration,
    client: RichReplica,
    through: String,
    backup: ServerLogGenerationBackup,
    native: String,
}
fn source() -> TestResult<Source> {
    let (files, mut room, profile) = fixture::setup()?;
    room.grant("owner", "alice", Some(Role::Editor))?;
    let author = room.register("alice")?;
    let mut client =
        profile.join_frame("room".into(), author.lease.writer.clone(), &room.catchup("alice")?)?;
    client.apply(vec![Command::InsertText(InsertText {
        block: "p".into(),
        offset: 0,
        text: "Retained before restore ".into(),
    })])?;
    let through = fixture::send(&mut room, &client, &author.lease, "0")?;
    client.apply(vec![Command::InsertText(InsertText {
        block: "p".into(),
        offset: 0,
        text: "Old offline ".into(),
    })])?;
    room.rotate_log_generation("owner", "two")?;
    let native = room.catchup("owner")?;
    let backup = room.export_log_generation_backup("owner")?;
    drop(room);
    Ok(Source { files, profile, author, client, through, backup, native })
}
fn interrupted(point: RestorePoint) -> TestResult {
    let Source { files, profile, author, mut client, mut through, backup, native } = source()?;
    let identity = backup.info().identity;
    let bytes = backup.to_bytes();
    let root = files.recovery();
    let mut attempt = ServerLogGenerationRecovery::begin(
        &root,
        &backup,
        &identity,
        RoomRecoveryPolicy::HostReacquired,
    )?;
    attempt.stop_after = Some(point);
    assert!(attempt.finish(&backup).is_err(), "{point:?}");
    let attempt = ServerLogGenerationRecovery::resume(
        &root,
        &backup,
        &identity,
        RoomRecoveryPolicy::HostReacquired,
    )?;
    if let Some(component) = attempt.component()? {
        let path = root.join(component.directory);
        if path.join(".prepared.json").exists() {
            assert!(Room::open_log_generations(&path).is_err(), "{point:?}");
        }
    }
    let mut restored = attempt.finish(&backup)?;
    assert_eq!(restored.room().catchup("owner")?, native, "{point:?}");
    assert_eq!(
        restored.room_mut().export_log_generation_backup("owner")?.to_bytes(),
        bytes,
        "{point:?}"
    );
    let server = restored.room_mut();
    let lease = server.resume("alice", &author.lease.writer, &author.credential)?;
    through = fixture::send(server, &client, &lease, &through)?;
    client.receive_frame(&server.catchup("alice")?)?;
    for redo in [false, true] {
        assert!(if redo { client.redo()? } else { client.undo()? });
        through = fixture::send(server, &client, &lease, &through)?;
        let observer =
            profile.join_frame("room".into(), "951".into(), &server.catchup("owner")?)?;
        assert_eq!(observer.document_json(), client.document_json(), "{point:?}");
        assert!(client.document_json().contains("Retained before restore "));
    }
    Ok(())
}
#[test]
fn every_owned_restore_prefix_resumes_without_resetting_old_native_history_or_exposing_prepared_rooms()
-> TestResult {
    for point in [
        RestorePoint::ComponentCreated,
        RestorePoint::ComponentSelected,
        RestorePoint::StageCreated,
        RestorePoint::PartSelected,
        RestorePoint::DataPrefix,
        RestorePoint::DataSynced,
        RestorePoint::FilePublished,
        RestorePoint::StageRetired,
        RestorePoint::FilesRestored,
        RestorePoint::NativeVerified,
        RestorePoint::ReadyLinked,
        RestorePoint::ReadyPublished,
        RestorePoint::CompletionSynced,
    ] {
        interrupted(point)?;
    }
    Ok(())
}
fn snapshot(root: &Path) -> TestResult<BTreeMap<String, Vec<u8>>> {
    fn walk(root: &Path, path: &Path, result: &mut BTreeMap<String, Vec<u8>>) -> TestResult {
        for entry in fs::read_dir(path)? {
            let entry = entry?;
            let path = entry.path();
            let key = path.strip_prefix(root)?.to_string_lossy().into_owned();
            if entry.file_type()?.is_dir() {
                result.insert(format!("dir:{key}"), Vec::new());
                walk(root, &path, result)?;
            } else {
                result.insert(key, fs::read(&path)?);
            }
        }
        Ok(())
    }
    let mut result = BTreeMap::new();
    walk(root, root, &mut result)?;
    Ok(result)
}
#[test]
fn occupied_even_matching_native_file_is_not_adopted_overwritten_or_deleted_after_an_owned_intent()
-> TestResult {
    use std::io::Write;
    for matching in [false, true] {
        let Source { files, backup, .. } = source()?;
        let identity = backup.info().identity;
        let root = files.recovery();
        let mut attempt = ServerLogGenerationRecovery::begin(
            &root,
            &backup,
            &identity,
            RoomRecoveryPolicy::HostReacquired,
        )?;
        attempt.stop_after = Some(RestorePoint::PartSelected);
        assert!(attempt.finish(&backup).is_err());
        let component: Component = files::read(&root.join(".component.json"))?;
        let path = root.join(&component.directory).join(".head.json");
        let mut options = fs::OpenOptions::new();
        options.create_new(true).write(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let mut occupied = options.open(&path)?;
        if matching {
            occupied.write_all(backup.selected_files()?.get(".head.json").ok_or("head")?)?;
        }
        occupied.sync_all()?;
        drop(occupied);
        let before = snapshot(&root)?;
        assert!(
            ServerLogGenerationRecovery::resume(
                &root,
                &backup,
                &identity,
                RoomRecoveryPolicy::HostReacquired
            )
            .is_err()
        );
        assert_eq!(snapshot(&root)?, before);
        // Only the isolated test's competing file, not recovery-owned state, is removed.
        fs::remove_file(path)?;
        ServerLogGenerationRecovery::resume(
            &root,
            &backup,
            &identity,
            RoomRecoveryPolicy::HostReacquired,
        )?
        .finish(&backup)?;
    }
    Ok(())
}
#[test]
fn transport_valid_native_authority_failure_cannot_publish_readiness_or_activate_a_room()
-> TestResult {
    let (files, mut room, _) = fixture::setup()?;
    room.log.append(crate::log::Event::Grant {
        actor: "intruder".into(),
        principal: "reader".into(),
        role: Some(Role::Reader),
    })?;
    let bytes = room.export_log_generation_backup("owner")?.to_bytes();
    let backup = ServerLogGenerationBackup::from_owned_bytes(bytes)?;
    let identity = backup.info().identity;
    drop(room);
    let destination = files.recovery();
    let attempt = ServerLogGenerationRecovery::begin(
        &destination,
        &backup,
        &identity,
        RoomRecoveryPolicy::HostReacquired,
    )?;
    assert!(matches!(attempt.finish(&backup), Err(crate::Error::Permission)));
    let component: Component = files::read(&destination.join(".component.json"))?;
    let path = destination.join(&component.directory);
    assert!(path.join(".prepared.json").exists());
    assert!(!path.join(".ready.json").exists());
    assert!(Room::open_log_generations(&path).is_err());
    let before = snapshot(&destination)?;
    let attempt = ServerLogGenerationRecovery::resume(
        &destination,
        &backup,
        &identity,
        RoomRecoveryPolicy::HostReacquired,
    )?;
    assert!(attempt.finish(&backup).is_err());
    assert_eq!(snapshot(&destination)?, before);
    Ok(())
}

#[cfg(unix)]
#[test]
fn byte_identical_replacement_component_directory_is_not_the_selected_recovery_owner() -> TestResult
{
    use std::os::unix::fs::PermissionsExt;
    let Source { files, backup, .. } = source()?;
    let identity = backup.info().identity;
    let destination = files.recovery();
    let mut attempt = ServerLogGenerationRecovery::begin(
        &destination,
        &backup,
        &identity,
        RoomRecoveryPolicy::HostReacquired,
    )?;
    attempt.stop_after = Some(RestorePoint::ComponentSelected);
    assert!(attempt.finish(&backup).is_err());
    let component: Component = files::read(&destination.join(".component.json"))?;
    let path = destination.join(&component.directory);
    let retained = destination.with_file_name("saved-component");
    fs::rename(&path, &retained)?;
    fs::create_dir(&path)?;
    fs::set_permissions(&path, fs::Permissions::from_mode(0o700))?;
    fs::copy(retained.join(".owner"), path.join(".owner"))?;
    let before = snapshot(&destination)?;
    assert!(
        ServerLogGenerationRecovery::resume(
            &destination,
            &backup,
            &identity,
            RoomRecoveryPolicy::HostReacquired
        )
        .is_err()
    );
    assert_eq!(snapshot(&destination)?, before);
    assert_eq!(fs::read(retained.join(".owner"))?, fs::read(path.join(".owner"))?);
    Ok(())
}

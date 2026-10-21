//! Native end-to-end restoration through public APIs, not a substitute document or merge model.
use super::{TestResult, insert, send, setup};
use breditor_collab_relay::{
    Role, RoomRecoveryPolicy, ServerLogGenerationBackup, ServerLogGenerationRecovery,
};

fn workflow(version: u32, standard: bool, atomic: bool) -> TestResult {
    let (files, profile, mut room) = setup(version, standard, atomic)?;
    room.grant("owner", "alice", Some(Role::Editor))?;
    let author = room.register("alice")?;
    let mut client =
        profile.join_frame("room".into(), author.lease.writer.clone(), &room.catchup("alice")?)?;
    insert(&mut client, "Retained ")?;
    let mut through = send(&mut room, &client, "alice", &author.lease, "0", atomic)?;
    insert(&mut client, "Old offline ")?;
    let saved = client.checkpoint()?;
    let first = room.rotate_log_generation("owner", "two")?;
    room.grant("owner", "bob", Some(Role::Editor))?;
    let peer = room.register("bob")?;
    let mut other =
        profile.join_frame("room".into(), peer.lease.writer.clone(), &room.catchup("bob")?)?;
    insert(&mut other, "Peer preserved ")?;
    send(&mut room, &other, "bob", &peer.lease, "0", atomic)?;
    room.rotate_log_generation("owner", "three")?;
    let native = room.catchup("owner")?;
    let selected = room.log_generation_descriptor("owner")?;
    let source = room.export_log_generation_backup("owner")?;
    let encoded = source.to_bytes();
    let backup = ServerLogGenerationBackup::from_owned_bytes(encoded.clone())?;
    let identity = backup.info().identity;
    drop(room); // Host policy has fenced the former deployment, not merely copied its data.
    let target = files.0.join("restored");
    let attempt = ServerLogGenerationRecovery::begin(
        &target,
        &backup,
        &identity,
        RoomRecoveryPolicy::HostReacquired,
    )?;
    let initial = attempt.progress(&backup)?;
    assert!(!initial.component_selected);
    assert_eq!(initial.files_published, 0);
    assert!(!initial.native_ready);
    drop(attempt);
    let attempt = ServerLogGenerationRecovery::resume(
        &target,
        &backup,
        &identity,
        RoomRecoveryPolicy::HostReacquired,
    )?;
    let mut restored = attempt.finish(&backup)?;
    assert_eq!(restored.room().catchup("owner")?, native);
    assert_eq!(restored.room().log_generation_descriptor("owner")?, selected);
    assert!(restored.room().validate_lease("alice", &author.lease).is_err());
    assert_eq!(restored.room_mut().export_log_generation_backup("owner")?.to_bytes(), encoded);
    let repeated = restored.room_mut().rotate_log_generation("owner", "two")?;
    assert!(repeated.duplicate);
    assert_eq!(repeated.after_manifest, first.after_manifest);
    drop(restored);
    let attempt = ServerLogGenerationRecovery::resume(
        &target,
        &backup,
        &identity,
        RoomRecoveryPolicy::HostReacquired,
    )?;
    let complete = attempt.progress(&backup)?;
    assert!(complete.native_ready && complete.completion_record);
    assert_eq!(complete.files_published, complete.files_total);
    let mut restored = attempt.finish(&backup)?;
    let room = restored.room_mut();
    let lease = room.resume("alice", &author.lease.writer, &author.credential)?;
    client = profile.restore("room", &saved)?;
    through = send(room, &client, "alice", &lease, &through, atomic)?;
    client.receive_frame(&room.catchup("alice")?)?;
    for redo in [false, true] {
        assert!(if redo { client.redo()? } else { client.undo()? });
        through = send(room, &client, "alice", &lease, &through, atomic)?;
        assert!(client.document_json().contains("Peer preserved "));
        let observer = profile.join_frame("room".into(), "950".into(), &room.catchup("owner")?)?;
        assert_eq!(observer.document_json(), client.document_json());
    }
    drop(restored);
    // A historic restore cannot silently replace later accepted service writes.
    assert!(
        ServerLogGenerationRecovery::resume(
            &target,
            &backup,
            &identity,
            RoomRecoveryPolicy::HostReacquired
        )
        .is_err()
    );
    Ok(())
}
#[test]
fn complete_native_restore_keeps_exact_archives_old_offline_input_receipts_and_peer_undo_in_ten_modes()
-> TestResult {
    let mut cases = 0;
    for (version, standard) in [(1, false), (2, false), (2, true), (3, false), (3, true)] {
        for atomic in [false, true] {
            workflow(version, standard, atomic)?;
            cases += 1;
        }
    }
    assert_eq!(cases, 10);
    Ok(())
}

#[test]
fn mismatched_native_identity_never_publishes_readiness_even_with_valid_archive_checksums()
-> TestResult {
    let (files, _, mut authority) = setup(3, true, true)?;
    authority.grant("owner", "reader", Some(Role::Reader))?;
    let bytes = authority.export_log_generation_backup("owner")?.to_bytes();
    let forged = super::backup::archive_with_owner(&bytes, "intruder")?;
    let backup = ServerLogGenerationBackup::from_owned_bytes(forged)?;
    let expected = backup.info().identity;
    drop(authority);
    let destination = files.0.join("wrong-native-identity");
    let attempt = ServerLogGenerationRecovery::begin(
        &destination,
        &backup,
        &expected,
        RoomRecoveryPolicy::HostReacquired,
    )?;
    assert!(attempt.finish(&backup).is_err());
    let component: serde_json::Value =
        serde_json::from_slice(&std::fs::read(destination.join(".component.json"))?)?;
    let native = destination.join(component["directory"].as_str().ok_or("component")?);
    assert!(native.join(".prepared.json").exists());
    assert!(!native.join(".ready.json").exists());
    assert!(breditor_collab_relay::Room::open_log_generations(&native).is_err());
    Ok(())
}

#[test]
fn wrong_expected_selection_and_occupied_destinations_refuse_before_reservation_writes()
-> TestResult {
    let (files, _, mut authority) = setup(3, true, true)?;
    let backup = authority.export_log_generation_backup("owner")?;
    let selected = backup.info().identity;
    let mut wrong = selected.clone();
    wrong.manifest[0] ^= 1;
    let destination = files.0.join("must-stay-absent");
    assert!(
        ServerLogGenerationRecovery::begin(
            &destination,
            &backup,
            &wrong,
            RoomRecoveryPolicy::HostReacquired
        )
        .is_err()
    );
    assert!(!destination.exists());
    std::fs::create_dir(&destination)?;
    let unrelated = destination.join("unrelated-work");
    std::fs::write(&unrelated, b"preserve it")?;
    assert!(
        ServerLogGenerationRecovery::begin(
            &destination,
            &backup,
            &selected,
            RoomRecoveryPolicy::HostReacquired
        )
        .is_err()
    );
    assert_eq!(std::fs::read(unrelated)?, b"preserve it");
    Ok(())
}

#[test]
fn unpublished_source_stages_and_empty_active_files_round_trip_through_native_restore() -> TestResult
{
    use std::io::Write;
    let (files, _, mut authority) = setup(3, true, true)?;
    let stage = format!(".stage-{}", "d".repeat(64));
    let mut options = std::fs::OpenOptions::new();
    options.create_new(true).write(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file = options.open(files.room().join(&stage))?;
    file.write_all(b"incomplete unpublished metadata")?;
    file.sync_all()?;
    drop(file);
    let backup = authority.export_log_generation_backup("owner")?;
    let encoded = backup.to_bytes();
    let expected = backup.info().identity;
    drop(authority);
    let destination = files.0.join("with-unpublished");
    let mut restored = ServerLogGenerationRecovery::begin(
        &destination,
        &backup,
        &expected,
        RoomRecoveryPolicy::HostReacquired,
    )?
    .finish(&backup)?;
    assert_eq!(restored.room_mut().export_log_generation_backup("owner")?.to_bytes(), encoded);
    let component: serde_json::Value =
        serde_json::from_slice(&std::fs::read(destination.join(".component.json"))?)?;
    assert_eq!(
        std::fs::read(
            destination.join(component["directory"].as_str().ok_or("component")?).join(stage)
        )?,
        b"incomplete unpublished metadata"
    );
    Ok(())
}

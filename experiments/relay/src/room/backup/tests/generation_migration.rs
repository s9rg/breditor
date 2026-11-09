//! Original WAL migration preserves the exact cut and ordinary native client recovery contracts.
use super::{
    roundtrip::{accepted_peer, flush_client, groups},
    *,
};
use crate::{
    Admission, Role, ServerLogGenerationBackup, ServerLogGenerationOptions,
    ServerLogGenerationRecovery,
};
use breditor_collab_feasibility::rich_replica::{Command, actions::InsertText};
use std::path::{Path, PathBuf};

const POLICY: RoomRecoveryPolicy = RoomRecoveryPolicy::HostReacquired;

fn options() -> ServerLogGenerationOptions {
    ServerLogGenerationOptions { root: "old".into(), active: "first".into() }
}

fn component(destination: &Path) -> TestResult<PathBuf> {
    let value: Value = serde_json::from_slice(&fs::read(destination.join(".component.json"))?)?;
    Ok(destination.join(value["directory"].as_str().ok_or("component directory")?))
}

#[test]
fn original_room_migration_preserves_offline_replay_and_redo_across_two_physical_rotations()
-> TestResult {
    for atomic in [false, true] {
        for (version, standard) in [(1, false), (2, false), (2, true), (3, false), (3, true)] {
            let directory = Directory::new()?;
            let (profile, mut source) = start(&directory, version, standard, atomic)?;
            source.grant("owner", "alice", Some(Role::Editor))?;
            source.grant("owner", "revoked", Some(Role::Editor))?;
            let registration = source.register("alice")?;
            let revoked = source.register("revoked")?;
            accepted_peer(&profile, &mut source, &revoked, atomic)?;
            let mut client = profile.join_frame(
                "room".into(),
                registration.lease.writer.clone(),
                &source.catchup("alice")?,
            )?;
            client.apply(vec![Command::InsertText(InsertText {
                block: "p".into(),
                offset: 0,
                text: "Accepted ".into(),
            })])?;
            let (through, accepted) = groups(&client, "0", atomic)?;
            let Admission::Durable(original_receipt) =
                source.admit("alice", &registration.lease, &accepted[0])?
            else {
                return Err("expected durable receipt".into());
            };
            let identity = source.backup_identity()?;
            let source_bytes = fs::read(directory.path("source.log"))?;
            let legacy = source.export_backup()?;
            let migrated = legacy.prepare_generation_migration(&identity, &options())?;
            assert_eq!(migrated.info().identity.source, identity);
            assert_eq!(
                migrated.to_bytes(),
                legacy.prepare_generation_migration(&identity, &options())?.to_bytes()
            );
            let migrated = ServerLogGenerationBackup::from_owned_bytes(migrated.to_bytes())?;
            let selected = migrated.info().identity;

            client.apply(vec![Command::InsertText(InsertText {
                block: "p".into(),
                offset: 0,
                text: "Offline 🙂 ".into(),
            })])?;
            client = profile.restore("room", &client.checkpoint()?)?;
            let destination = directory.path("migrated");
            let attempt =
                ServerLogGenerationRecovery::begin(&destination, &migrated, &selected, POLICY)?;
            drop(attempt);
            let mut recovered =
                ServerLogGenerationRecovery::resume(&destination, &migrated, &selected, POLICY)?
                    .finish(&migrated)?;
            let inner = component(&destination)?;
            let root = fs::read_dir(&inner)?
                .filter_map(|entry| entry.ok().map(|entry| entry.path()))
                .find(|path| {
                    path.extension().is_some_and(|ext| ext == "wal")
                        && fs::read(path).is_ok_and(|bytes| bytes == source_bytes)
                })
                .ok_or("exact original root")?;
            let room = recovered.room_mut();
            let descriptor = room.log_generation_descriptor("owner")?;
            assert_eq!(descriptor.next_sequence, identity.records.to_string());
            assert_eq!(descriptor.terminal_digest, identity.terminal_log_digest);
            assert_eq!(room.catchup("owner")?, source.catchup("owner")?);
            assert!(room.admit("alice", &registration.lease, &accepted[0]).is_err());
            assert!(room.resume("revoked", &revoked.lease.writer, &revoked.credential).is_err());
            let lease =
                room.resume("alice", &registration.lease.writer, &registration.credential)?;
            let Admission::Durable(retry) = room.admit("alice", &lease, &accepted[0])? else {
                return Err("expected duplicate receipt".into());
            };
            assert!(retry.duplicate);
            assert_eq!(retry.sequence, original_receipt.sequence);
            assert_eq!(retry.receipt, original_receipt.receipt);
            let through = flush_client(room, &client, &lease, &through, atomic)?;
            let edited = client.document_json().to_owned();
            room.rotate_log_generation("owner", "second")?;
            assert!(client.undo()?);
            let through = flush_client(room, &client, &lease, &through, atomic)?;
            room.rotate_log_generation("owner", "third")?;
            let final_cut = room.log_generation_descriptor("owner")?;
            assert_eq!(final_cut.sealed, 2);
            let continued = room.export_log_generation_backup("owner")?;
            let continued = ServerLogGenerationBackup::from_owned_bytes(continued.to_bytes())?;
            assert_eq!(
                continued.info().identity.source.terminal_log_digest,
                final_cut.terminal_digest
            );
            drop(recovered);
            let (mut room, recovery) = Room::open_log_generations(&inner)?;
            assert_eq!(recovery.truncated_bytes, 0);
            assert_eq!(room.log_generation_descriptor("owner")?, final_cut);
            client = profile.restore("room", &client.checkpoint()?)?;
            let lease =
                room.resume("alice", &registration.lease.writer, &registration.credential)?;
            assert!(client.redo()?);
            flush_client(&mut room, &client, &lease, &through, atomic)?;
            assert_eq!(room.replica.document_json(), edited);
            assert_eq!(fs::read(root)?, source_bytes);
            assert_eq!(fs::read(directory.path("source.log"))?, source_bytes);
        }
    }
    Ok(())
}

#[test]
fn a_wrong_original_cut_refuses_preparation_and_a_wrong_genesis_never_publishes_readiness()
-> TestResult {
    let directory = Directory::new()?;
    let (_, mut source) = start(&directory, 1, false, false)?;
    let expected = source.backup_identity()?;
    let archive = source.export_backup()?;
    let mut wrong_cut = expected.clone();
    wrong_cut.terminal_log_digest[0] ^= 1;
    assert!(archive.prepare_generation_migration(&wrong_cut, &options()).is_err());
    assert!(
        archive
            .prepare_generation_migration(
                &expected,
                &ServerLogGenerationOptions { root: "same".into(), active: "same".into() }
            )
            .is_err()
    );
    let mut wrong_owner = expected;
    wrong_owner.owner = "other".into();
    let selected = archive.prepare_generation_migration(&wrong_owner, &options())?;
    let destination = directory.path("migrated");
    let migration = ServerLogGenerationRecovery::begin(
        &destination,
        &selected,
        &selected.info().identity,
        POLICY,
    )?;
    assert!(migration.finish(&selected).is_err());
    assert!(!destination.join(".complete.json").exists());
    assert!(Room::open_log_generations(&component(&destination)?).is_err());
    assert_eq!(source.backup_identity()?.owner, "owner");
    Ok(())
}

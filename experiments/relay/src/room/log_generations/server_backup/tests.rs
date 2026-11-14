//! Exact new framing, unchanged component bytes, native source matching and owned allocation.
use super::super::server_recovery::tests::source;
use super::*;
use crate::{
    Role, RoomRecoveryPolicy, ServerLogGenerationBackup, ServerLogGenerationRoomRecovery,
    ServerRoomBackup,
};
use sha2::{Digest, Sha256};
use std::io::{self, Write};
type TestResult<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;

fn framed(backup: &ServerLogGenerationRoomBackup, header: &format::Header) -> TestResult<Vec<u8>> {
    let mut bytes = format::prefix(&serde_json::to_vec(header)?)?;
    backup.native.write_to(&mut bytes)?;
    backup.assets.write_to(&mut bytes)?;
    Ok(bytes)
}

#[test]
fn all_ten_joined_capture_choices_keep_exact_unchanged_native_and_raster_archives_without_source_mutation()
-> TestResult {
    for (version, standard) in [(1, false), (2, false), (2, true), (3, false), (3, true)] {
        for atomic in [false, true] {
            let (_files, mut room, mut assets, _) = source(version, standard, atomic)?;
            let before = room.export_log_generation_backup("owner")?.to_bytes();
            let original_rasters = assets.export_backup()?.to_bytes()?;
            let inventory = room.log_generation_participant_inventory("owner")?;
            let backup = ServerLogGenerationRoomBackup::capture(&mut room, &mut assets, "owner")?;
            let info = backup.info()?;
            assert_eq!(info.identity.native, inventory.identity().source);
            assert_eq!(backup.native.to_bytes(), before);
            assert_eq!(backup.assets.to_bytes()?, original_rasters);
            let bytes = backup.to_bytes()?;
            assert_eq!(info.bytes, bytes.len() as u64);
            assert_eq!(info.identity.archive_sha256, <[u8; 32]>::from(Sha256::digest(&bytes)));
            let mut streamed = Vec::new();
            backup.write_to(&mut streamed)?;
            assert_eq!(streamed, bytes);
            let admitted = ServerLogGenerationRoomBackup::from_bytes(&bytes)?;
            assert_eq!(admitted.info()?, info);
            admitted.check_live(&mut room, &assets, "owner")?;
            let owned = ServerLogGenerationRoomBackup::from_owned_bytes(bytes)?;
            assert_eq!(owned.info()?, info);
            assert!(ServerRoomBackup::from_bytes(&owned.to_bytes()?).is_err());
            assert!(ServerLogGenerationBackup::from_bytes(&owned.to_bytes()?).is_err());
            assert!(ServerLogGenerationRoomBackup::from_bytes(&before).is_err());
            assert_eq!(room.export_log_generation_backup("owner")?.to_bytes(), before);
            assert_eq!(assets.export_backup()?.to_bytes()?, original_rasters);
        }
    }
    Ok(())
}

#[test]
fn checksum_valid_wrong_families_ranges_bindings_or_component_identities_never_admit_a_partial_joined_archive()
-> TestResult {
    let (files, mut room, mut assets, _) = source(3, true, true)?;
    let backup = ServerLogGenerationRoomBackup::capture(&mut room, &mut assets, "owner")?;
    let file = backup.to_bytes()?;
    let disk_path = files.recovery().with_file_name("joined-backup-admission");
    for case in 0..11 {
        let mut header: format::Header =
            serde_json::from_slice(&serde_json::to_vec(&backup.header)?)?;
        match case {
            0 => header.format = "breditor/server-room-backup".into(),
            1 => header.format_version = 2,
            2 => header.native.manifest[0] ^= 1,
            3 => header.native.source.records += 1,
            4 => header.assets.binding = format!("sha256:{}", "a".repeat(64)),
            5 => header.assets.assets += 1,
            6 => header.log.offset = 1,
            7 => header.rasters.offset -= 1,
            8 => header.log.bytes = u64::MAX,
            9 => header.log.sha256[0] ^= 1,
            _ => header.rasters.bytes += 1,
        }
        let bytes = framed(&backup, &header)?;
        assert!(ServerLogGenerationRoomBackup::from_bytes(&bytes).is_err(), "variant {case}");
        std::fs::write(&disk_path, &bytes)?;
        let selected = super::ServerLogGenerationRoomBackupIdentity {
            native: header.native,
            assets: header.assets,
            archive_sha256: format::sha(&bytes),
        };
        assert!(
            super::ServerLogGenerationRoomBackupFile::open(
                std::fs::File::open(&disk_path)?,
                &selected
            )
            .is_err(),
            "file variant {case}"
        );
        assert!(ServerLogGenerationRoomBackup::from_owned_bytes(bytes).is_err(), "variant {case}");
    }
    for length in [0, format::PREFIX - 1, format::PREFIX, file.len() / 2, file.len() - 1] {
        assert!(ServerLogGenerationRoomBackup::from_bytes(&file[..length]).is_err());
    }
    let mut trailing = file.clone();
    trailing.push(0);
    assert!(ServerLogGenerationRoomBackup::from_bytes(&trailing).is_err());
    let mut corrupt = file;
    *corrupt.last_mut().ok_or("body")? ^= 1;
    assert!(ServerLogGenerationRoomBackup::from_bytes(&corrupt).is_err());
    Ok(())
}

struct BrokenWriter;
impl Write for BrokenWriter {
    fn write(&mut self, _: &[u8]) -> io::Result<usize> {
        Err(io::Error::other("fixture output unavailable"))
    }
    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}
#[test]
fn detached_output_errors_and_stale_selections_do_not_poison_valid_newer_sources_or_restore_old_permissions()
-> TestResult {
    let (_files, mut room, mut assets, _) = source(3, true, true)?;
    let backup = ServerLogGenerationRoomBackup::capture(&mut room, &mut assets, "owner")?;
    assert!(backup.write_to(&mut BrokenWriter).is_err());
    backup.check_live(&mut room, &assets, "owner")?;
    room.grant("owner", "reader", Some(Role::Reader))?;
    room.rotate_log_generation("owner", "later")?;
    assert!(backup.check_live(&mut room, &assets, "owner").is_err());
    backup.check_retained(&mut room, &mut assets, "owner")?;
    assert!(backup.check_retained(&mut room, &mut assets, "reader").is_err());
    assert!(ServerLogGenerationRoomBackup::capture(&mut room, &mut assets, "reader").is_err());
    room.catchup("reader")?;
    ServerLogGenerationRoomBackup::capture(&mut room, &mut assets, "owner")?;
    Ok(())
}

#[test]
fn a_transport_valid_native_authority_failure_cannot_publish_a_joined_completion_or_restore_rasters()
-> TestResult {
    let (files, mut room, mut assets, _) = source(3, true, true)?;
    room.log.append(crate::log::Event::Grant {
        actor: "intruder".into(),
        principal: "reader".into(),
        role: Some(Role::Editor),
    })?;
    let backup = ServerLogGenerationRoomBackup::capture(&mut room, &mut assets, "owner")?;
    let admitted = ServerLogGenerationRoomBackup::from_owned_bytes(backup.to_bytes()?)?;
    let selected = admitted.info()?.identity;
    drop(room);
    drop(assets);
    let attempt = ServerLogGenerationRoomRecovery::begin(
        &files.recovery(),
        &admitted,
        &selected,
        RoomRecoveryPolicy::HostReacquired,
    )?;
    assert!(attempt.finish(&admitted).is_err());
    assert!(!files.recovery().join(".complete.json").exists());
    assert!(!files.recovery().join(".rasters.json").exists());
    assert!(
        ServerLogGenerationRoomRecovery::resume(
            &files.recovery(),
            &admitted,
            &selected,
            RoomRecoveryPolicy::HostReacquired
        )?
        .finish(&admitted)
        .is_err()
    );
    Ok(())
}

#[test]
fn owned_joined_admission_transfers_the_original_allocation_instead_of_copying_native_history()
-> TestResult {
    let (_files, mut room, mut assets, _) = source(3, true, true)?;
    let backup = ServerLogGenerationRoomBackup::capture(&mut room, &mut assets, "owner")?;
    let encoded = backup.to_bytes()?;
    let original = (encoded.as_ptr() as usize, encoded.capacity());
    let admitted = ServerLogGenerationRoomBackup::from_owned_bytes(encoded)?;
    assert_eq!(admitted.native.allocation_for_test(), original);
    assert_eq!(admitted.info()?, backup.info()?);
    Ok(())
}

#[test]
fn changed_unpublished_work_stales_the_archive_check_without_poisoning_the_valid_native_owner()
-> TestResult {
    use std::{fs, io::Write, os::unix::fs::OpenOptionsExt};
    let (files, mut room, mut assets, _) = source(3, true, true)?;
    let path = files.room().join(format!(".stage-{}", "e".repeat(64)));
    let mut file = fs::OpenOptions::new().write(true).create_new(true).mode(0o600).open(&path)?;
    file.write_all(b"retained unpublished work")?;
    file.sync_all()?;
    drop(file);
    let backup = ServerLogGenerationRoomBackup::capture(&mut room, &mut assets, "owner")?;
    fs::write(&path, b"different unpublished work")?;
    assert!(backup.check_live(&mut room, &assets, "owner").is_err());
    assert!(backup.check_retained(&mut room, &mut assets, "owner").is_err());
    room.catchup("owner")?;
    let newer = ServerLogGenerationRoomBackup::capture(&mut room, &mut assets, "owner")?;
    newer.check_live(&mut room, &assets, "owner")?;
    Ok(())
}

#[test]
fn an_empty_raster_inventory_and_empty_active_log_are_not_omitted_from_the_joined_source()
-> TestResult {
    let (files, mut room, _assets, _) = source(3, true, true)?;
    let mut empty = crate::assets::AssetStore::open(
        &files.recovery().with_file_name("empty-rasters"),
        room.asset_binding(),
    )?;
    let backup = ServerLogGenerationRoomBackup::capture(&mut room, &mut empty, "owner")?;
    assert_eq!(backup.info()?.identity.assets.assets, 0);
    assert_eq!(backup.info()?.identity.assets.bytes, 0);
    drop(room);
    drop(empty);
    let mut recovered = ServerLogGenerationRoomRecovery::begin(
        &files.recovery(),
        &backup,
        &backup.info()?.identity,
        RoomRecoveryPolicy::HostReacquired,
    )?
    .finish(&backup)?;
    assert_eq!(recovered.assets().count(), 0);
    recovered.check_live_source(&backup, "owner")?;
    Ok(())
}

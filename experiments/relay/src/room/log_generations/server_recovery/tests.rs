//! Joined recovery regressions use actual native owners and actual PNG/JPEG/WebP decoding.
use super::super::{ServerLogGenerationRoomBackup, ServerLogGenerationRoomBackupIdentity};
use super::*;
use crate::room::log_generations::tests::{Files, setup_profile};
use crate::{
    Room, RoomRecoveryPolicy,
    assets::{AssetStore, asset_id, prepare_asset},
};
use breditor_collab_feasibility::rich_replica::SharedRichProfile;
use image::{DynamicImage, ImageFormat};
use std::{collections::BTreeMap, fs, io::Cursor, path::Path};
type TestResult<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;
const POLICY: RoomRecoveryPolicy = RoomRecoveryPolicy::HostReacquired;

pub(in crate::room) fn source(
    version: u32,
    standard: bool,
    atomic: bool,
) -> TestResult<(Files, Room, AssetStore, SharedRichProfile)> {
    let (files, mut room, profile) = setup_profile(version, standard, atomic)?;
    room.register("owner")?;
    let mut assets =
        AssetStore::open(&files.recovery().with_file_name("source-assets"), room.asset_binding())?;
    for (kind, mime) in [
        (ImageFormat::Png, "image/png"),
        (ImageFormat::Jpeg, "image/jpeg"),
        (ImageFormat::WebP, "image/webp"),
    ] {
        let mut bytes = Cursor::new(Vec::new());
        DynamicImage::new_rgb8(2, 3).write_to(&mut bytes, kind)?;
        let bytes = bytes.into_inner();
        room.put_asset("owner", &mut assets, prepare_asset(&asset_id(&bytes), mime, bytes)?)?;
    }
    room.rotate_log_generation("owner", "two")?;
    Ok((files, room, assets, profile))
}
fn begin(
    files: &Files,
    backup: &ServerLogGenerationRoomBackup,
) -> TestResult<ServerLogGenerationRoomRecovery> {
    Ok(ServerLogGenerationRoomRecovery::begin(
        &files.recovery(),
        backup,
        &backup.info()?.identity,
        POLICY,
    )?)
}
fn resume(
    files: &Files,
    backup: &ServerLogGenerationRoomBackup,
) -> TestResult<ServerLogGenerationRoomRecovery> {
    Ok(ServerLogGenerationRoomRecovery::resume(
        &files.recovery(),
        backup,
        &backup.info()?.identity,
        POLICY,
    )?)
}
fn snapshot(root: &Path) -> TestResult<BTreeMap<String, Vec<u8>>> {
    let mut output = BTreeMap::new();
    for entry in fs::read_dir(root)? {
        let entry = entry?;
        let name = entry.file_name().into_string().map_err(|_| "fixture file name")?;
        if entry.file_type()?.is_dir() {
            for (child, bytes) in snapshot(&entry.path())? {
                output.insert(format!("{name}/{child}"), bytes);
            }
        } else {
            output.insert(name, fs::read(entry.path())?);
        }
    }
    Ok(output)
}

#[test]
fn every_joined_synced_prefix_resumes_actual_native_history_and_exact_rasters_without_early_completion()
-> TestResult {
    use interruption::JoinedPoint;
    let points = [
        JoinedPoint::NativeCreated,
        JoinedPoint::NativeSelected,
        JoinedPoint::NativeReady,
        JoinedPoint::RasterCreated,
        JoinedPoint::RasterSelected,
        JoinedPoint::RasterStageCreated,
        JoinedPoint::RasterPartSelected,
        JoinedPoint::RasterDataPrefix,
        JoinedPoint::RasterDataSynced,
        JoinedPoint::RasterFilePublished,
        JoinedPoint::RasterStageRetired,
        JoinedPoint::FilesRestored,
        JoinedPoint::ComponentsVerified,
        JoinedPoint::CompletionSynced,
    ];
    for point in points {
        let (files, mut room, mut assets, _) = source(3, true, true)?;
        let native = room.catchup("owner")?;
        let backup = ServerLogGenerationRoomBackup::capture(&mut room, &mut assets, "owner")?;
        let encoded = backup.to_bytes()?;
        drop(room);
        drop(assets);
        let mut attempt = begin(&files, &backup)?;
        attempt.stop_after = Some(point);
        assert!(attempt.finish(&backup).is_err(), "{point:?}");
        let attempt = resume(&files, &backup)?;
        let progress = attempt.progress(&backup)?;
        assert_eq!(progress.completion_record, point == JoinedPoint::CompletionSynced, "{point:?}");
        let mut recovered = attempt.finish(&backup)?;
        assert_eq!(recovered.room().catchup("owner")?, native, "{point:?}");
        assert_eq!(recovered.assets().count(), 3, "{point:?}");
        recovered.check_live_source(&backup, "owner")?;
        let (room, assets) = recovered.components_mut();
        assert_eq!(
            ServerLogGenerationRoomBackup::capture(room, assets, "owner")?.to_bytes()?,
            encoded,
            "{point:?}"
        );
        drop(recovered);
        let attempt = resume(&files, &backup)?;
        assert!(attempt.progress(&backup)?.completion_record);
        let mut recovered = attempt.finish(&backup)?;
        recovered.check_live_source(&backup, "owner")?;
    }
    Ok(())
}

#[test]
fn an_unrelated_even_matching_raster_target_after_intent_is_preserved_and_refused() -> TestResult {
    use std::{io::Write, os::unix::fs::OpenOptionsExt};
    for matching in [false, true] {
        let (files, mut room, mut assets, _) = source(3, true, true)?;
        let backup = ServerLogGenerationRoomBackup::capture(&mut room, &mut assets, "owner")?;
        drop(room);
        drop(assets);
        let mut attempt = begin(&files, &backup)?;
        attempt.stop_after = Some(interruption::JoinedPoint::RasterPartSelected);
        assert!(attempt.finish(&backup).is_err());
        let component: selection::RasterComponent =
            files::read(&files.recovery().join(".rasters.json"))?;
        let selected = backup.rasters().selected_files();
        let (name, bytes) = selected.first_key_value().ok_or("native raster")?;
        let path = files.recovery().join(component.directory).join(name);
        let mut file =
            fs::OpenOptions::new().write(true).create_new(true).mode(0o600).open(&path)?;
        file.write_all(if matching { bytes } else { &[] })?;
        file.sync_all()?;
        drop(file);
        let before = snapshot(&files.recovery())?;
        assert!(resume(&files, &backup).is_err());
        assert_eq!(snapshot(&files.recovery())?, before);
    }
    Ok(())
}

#[test]
fn source_identity_mismatch_and_occupied_destinations_refuse_before_reservation() -> TestResult {
    let (files, mut room, mut assets, _) = source(3, true, true)?;
    let backup = ServerLogGenerationRoomBackup::capture(&mut room, &mut assets, "owner")?;
    let mut selected: ServerLogGenerationRoomBackupIdentity = backup.info()?.identity;
    selected.archive_sha256[0] ^= 1;
    assert!(
        ServerLogGenerationRoomRecovery::begin(&files.recovery(), &backup, &selected, POLICY)
            .is_err()
    );
    assert!(!files.recovery().exists());
    fs::create_dir(files.recovery())?;
    fs::write(files.recovery().join("unrelated"), b"preserve")?;
    let before = snapshot(&files.recovery())?;
    assert!(begin(&files, &backup).is_err());
    assert_eq!(snapshot(&files.recovery())?, before);
    Ok(())
}

#[test]
fn actual_joined_source_recheck_must_reject_a_changed_component_family_without_touching_data()
-> TestResult {
    let (files, mut room, mut assets, _) = source(3, true, true)?;
    let backup = ServerLogGenerationRoomBackup::capture(&mut room, &mut assets, "owner")?;
    drop(room);
    drop(assets);
    let mut recovered = begin(&files, &backup)?.finish(&backup)?;
    let path = recovered.root().join(".native.json");
    let mut component: selection::NativeComponent = files::read(&path)?;
    component.format = "different-component-family".into();
    fs::write(&path, files::encode(&component)?)?;
    let before = snapshot(recovered.root())?;
    assert!(recovered.check_live_source(&backup, "owner").is_err());
    assert_eq!(snapshot(recovered.root())?, before);
    Ok(())
}

#[test]
fn matching_replacement_raster_inodes_are_not_adopted_as_original_restored_files() -> TestResult {
    use std::{io::Write, os::unix::fs::OpenOptionsExt};
    let (files, mut room, mut assets, _) = source(3, true, true)?;
    let backup = ServerLogGenerationRoomBackup::capture(&mut room, &mut assets, "owner")?;
    drop(room);
    drop(assets);
    let mut recovered = begin(&files, &backup)?.finish(&backup)?;
    let component: selection::RasterComponent =
        files::read(&recovered.root().join(".rasters.json"))?;
    let selected = backup.rasters().selected_files();
    let (name, bytes) = selected.first_key_value().ok_or("original raster")?;
    let path = recovered.root().join(component.directory).join(name);
    let retained = files.recovery().with_file_name("original-raster-file");
    fs::rename(&path, &retained)?;
    let mut file = fs::OpenOptions::new().write(true).create_new(true).mode(0o600).open(&path)?;
    file.write_all(bytes)?;
    file.sync_all()?;
    drop(file);
    let before = snapshot(recovered.root())?;
    assert!(recovered.check_live_source(&backup, "owner").is_err());
    assert_eq!(snapshot(recovered.root())?, before);
    assert_eq!(fs::read(retained)?, *bytes);
    Ok(())
}

#[test]
fn actual_joined_source_recheck_must_reject_unknown_parent_work_without_removing_it() -> TestResult
{
    use std::{io::Write, os::unix::fs::OpenOptionsExt};
    let (files, mut room, mut assets, _) = source(3, true, true)?;
    let backup = ServerLogGenerationRoomBackup::capture(&mut room, &mut assets, "owner")?;
    drop(room);
    drop(assets);
    let mut recovered = begin(&files, &backup)?.finish(&backup)?;
    let mut file = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .mode(0o600)
        .open(recovered.root().join("unrelated-retained-work"))?;
    file.write_all(b"preserve this work")?;
    file.sync_all()?;
    drop(file);
    let before = snapshot(recovered.root())?;
    assert!(recovered.check_live_source(&backup, "owner").is_err());
    assert_eq!(snapshot(recovered.root())?, before);
    Ok(())
}

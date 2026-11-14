use super::RelaySegmentRoomBackupFiles;
use crate::{
    Error, RelaySegmentBaseFile, Role, Room, RoomRecoveryPolicy,
    assets::{AssetStore, asset_id, prepare_asset},
    room::log_generations::tests::setup_profile,
};
use std::{
    fs::{self, File},
    io::Write,
    sync::Arc,
};

type TestResult = Result<(), Box<dyn std::error::Error>>;
const REACQUIRE: RoomRecoveryPolicy = RoomRecoveryPolicy::HostReacquired;

#[test]
fn segment_room_restore_survives_absent_source_directories_and_can_roll_over_again() -> TestResult {
    let (files, mut room, _) = setup_profile(3, true, true)?;
    let source = files.room();
    let first = files.recovery();
    let parent = source.parent().ok_or("fixture directory")?;
    let old_assets = parent.join("old-rasters");
    let mut assets = AssetStore::open(&old_assets, room.asset_binding())?;
    let mut png = std::io::Cursor::new(Vec::new());
    image::DynamicImage::new_rgba8(1, 1).write_to(&mut png, image::ImageFormat::Png)?;
    let png = png.into_inner();
    let raster_id = asset_id(&png);
    room.put_asset("owner", &mut assets, prepare_asset(&raster_id, "image/png", png.clone())?)?;
    room.grant("owner", "old-reader", Some(Role::Reader))?;
    let archive = parent.join("base.wal");
    let checkpoint = parent.join("base.state");
    let id = room.write_relay_segment_base(
        "owner",
        &mut File::create_new(&archive)?,
        &mut File::create_new(&checkpoint)?,
    )?;
    let base =
        Arc::new(RelaySegmentBaseFile::open(File::open(archive)?, File::open(checkpoint)?, &id)?);
    let mut continued =
        room.continue_into_relay_segment("owner", &first, base.clone(), "continued")?;
    drop(room);
    continued.grant("owner", "continued-reader", Some(Role::Reader))?;
    let references = continued.relay_segment_retained_asset_references("owner")?;
    let native = parent.join("latest.wal");
    let state = parent.join("latest.state");
    let rasters = parent.join("latest.rasters");
    let identity = continued.write_relay_segment_room_backup(
        "owner",
        &assets,
        &mut File::create_new(&native)?,
        &mut File::create_new(&state)?,
        &mut File::create_new(&rasters)?,
    )?;
    let native = Arc::new(RelaySegmentBaseFile::open_linked(
        File::open(native)?,
        File::open(state)?,
        &identity.native,
        base,
    )?);
    let mut wrong = identity.clone();
    wrong.history_sha256[0] ^= 1;
    assert!(
        RelaySegmentRoomBackupFiles::open(native.clone(), File::open(&rasters)?, &wrong).is_err()
    );
    let damaged = parent.join("damaged.rasters");
    let mut bytes = fs::read(&rasters)?;
    bytes[0] ^= 1;
    fs::write(&damaged, bytes)?;
    assert!(
        RelaySegmentRoomBackupFiles::open(native.clone(), File::open(damaged)?, &identity).is_err()
    );
    let backup =
        RelaySegmentRoomBackupFiles::open(native.clone(), File::open(&rasters)?, &identity)?;
    let target = parent.join("reconstructed");
    assert!(backup.restore(&target, "continued", REACQUIRE).is_err());
    assert!(!target.exists());
    fs::create_dir(&target)?;
    fs::write(target.join("unrelated"), b"do not replace")?;
    assert!(backup.restore(&target, "restored", REACQUIRE).is_err());
    assert_eq!(fs::read(target.join("unrelated"))?, b"do not replace");
    fs::remove_file(target.join("unrelated"))?;
    fs::remove_dir(&target)?;

    drop(continued);
    drop(assets);
    for path in [&source, &first, &old_assets] {
        fs::remove_dir_all(path)?;
    }
    let mut restored = backup.restore(&target, "restored", REACQUIRE)?;
    assert!(matches!(backup.reopen(&target, REACQUIRE), Err(Error::Locked)));
    let (room, assets) = restored.components_mut();
    let recovered = room.relay_segment_retained_asset_references("owner")?;
    assert_eq!(recovered.sources, references.sources);
    assert_eq!(recovered.outcome, references.outcome);
    assert_eq!(room.log_generation_descriptor("owner")?.root, "root");
    assert_eq!(room.read_asset("owner", assets, &raster_id)?.ok_or("original raster")?.bytes, png);
    room.catchup("old-reader")?;
    room.catchup("continued-reader")?;
    room.grant("owner", "new-reader", Some(Role::Reader))?;
    drop(restored);
    let active = target.join("native").join(crate::log::generations::test_wal_name("restored"));
    fs::OpenOptions::new().append(true).open(&active)?.write_all(&[0; 9])?;
    let torn = fs::read(&active)?;
    assert!(backup.reopen(&target, REACQUIRE).is_err());
    assert_eq!(fs::read(&active)?, torn);
    // Revert only these fixture bytes to exercise the other cold tests.
    fs::OpenOptions::new().write(true).open(&active)?.set_len((torn.len() - 9) as u64)?;

    let raster_path = target.join("rasters").join(format!("{}.asset", &raster_id[7..]));
    let saved_path = parent.join("temporarily-missing.asset");
    fs::rename(&raster_path, &saved_path)?;
    assert!(backup.reopen(&target, REACQUIRE).is_err());
    assert!(!raster_path.exists());
    fs::rename(&saved_path, &raster_path)?;

    let mut restored = backup.reopen(&target, REACQUIRE)?;
    let (room, _) = restored.components_mut();
    room.catchup("new-reader")?;
    let archive = parent.join("rolled.wal");
    let checkpoint = parent.join("rolled.state");
    let id = room.write_relay_segment_base(
        "owner",
        &mut File::create_new(&archive)?,
        &mut File::create_new(&checkpoint)?,
    )?;
    let base = Arc::new(RelaySegmentBaseFile::open_linked(
        File::open(archive)?,
        File::open(checkpoint)?,
        &id,
        native,
    )?);
    let next = parent.join("next");
    let successor = room.continue_into_relay_segment("owner", &next, base.clone(), "new-cut")?;
    drop(successor);
    drop(restored);
    assert!(backup.reopen(&target, REACQUIRE).is_err());
    let (room, _) = Room::open_relay_segment_successor(&target.join("native"), &next, base)?;
    room.catchup("new-reader")?;
    Ok(())
}

//! Qualify exact and descendant operational custody from the held original file.
use super::*;
use crate::ServerLogGenerationRoomBackupFile;
use std::os::unix::fs::FileExt;

#[test]
fn incomplete_file_handoff_resumes_before_admitting_later_wal_and_raster_data() -> TestResult {
    let (files, buffered, recovered) = restored()?;
    let target = files.recovery();
    let path = target.with_file_name("original.backup");
    fs::write(&path, buffered.to_bytes()?)?;
    let expected = buffered.info()?.identity;
    let original = ServerLogGenerationRoomBackupFile::open(fs::File::open(&path)?, &expected)?;
    assert!(matches!(
        recovered.handoff_selected(
            super::super::super::origin::Origin::File(&original),
            &expected,
            POLICY,
            "owner",
            &Interruption { point: Some(Point::DataPrefix) }
        ),
        Err(Error::Contract("interrupted generation operational handoff"))
    ));
    assert!(!target.join(".operational.json").exists());
    let mut owner = OperationalLogGenerationServerRoom::resume_file(
        &target, &original, &expected, POLICY, "owner",
    )?;
    assert!(target.join(".operational.json").exists());
    // Grow the original active WAL, seal it, and continue once more; the historical active
    // section is now a strict prefix of a sealed WAL distinct from the current active file.
    owner.room_mut().grant("owner", "read-after-handoff", Some(Role::Reader))?;
    owner.room_mut().rotate_log_generation("owner", "after-operation")?;
    let (room, assets) = owner.components_mut();
    let mut raster = Cursor::new(Vec::new());
    DynamicImage::new_rgb8(4, 5).write_to(&mut raster, ImageFormat::Png)?;
    let bytes = raster.into_inner();
    room.put_asset("owner", assets, prepare_asset(&asset_id(&bytes), "image/png", bytes)?)?;
    let current = room.catchup("owner")?;
    owner.check_live_source_file(&original, "owner")?;
    drop(owner);
    let mut owner = OperationalLogGenerationServerRoom::resume_file(
        &target, &original, &expected, POLICY, "owner",
    )?;
    assert_eq!(owner.room().catchup("owner")?, current);
    owner.room().catchup("read-after-handoff")?;
    assert_eq!(owner.assets().count(), 4);
    owner.check_live_source(&buffered, "owner")?;
    drop(owner);

    let mut changed = [0];
    let length = original.info().bytes;
    fs::File::open(&path)?.read_exact_at(&mut changed, length - 1)?;
    changed[0] ^= 1;
    let writer = fs::OpenOptions::new().write(true).open(&path)?;
    writer.write_all_at(&changed, length - 1)?;
    writer.sync_all()?;
    let retained = snapshot(&target)?;
    assert!(
        OperationalLogGenerationServerRoom::resume_file(
            &target, &original, &expected, POLICY, "owner"
        )
        .is_err()
    );
    assert_eq!(snapshot(&target)?, retained);
    assert_eq!(reopen(&target, &buffered)?.assets().count(), 4);
    Ok(())
}

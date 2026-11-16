//! Exercise interrupted rotations in a genuinely linked and activated continued room.
use super::TestResult;
use crate::{
    Error, Role,
    log::generations::{RotationPoint, test_wal_name},
    server::{
        Authentication, ContinuedRasterRestart, ContinuedRasterRoomBackupFiles,
        ContinuedRasterRoomBackupIdentity, ContinuedRasterRotationInspection,
        ContinuedRasterRotationRepair, ContinuedRasterRotationRepairOutcome,
    },
};
use std::{fs, os::unix::fs::MetadataExt, path::Path};

pub(super) fn check_interrupted_rotation(
    root: &Path,
    backup: &ContinuedRasterRoomBackupFiles,
    restart: &ContinuedRasterRestart<'_>,
    floor: &ContinuedRasterRoomBackupIdentity,
    authenticate: impl Fn() -> crate::Result<Authentication>,
    token: &str,
) -> TestResult {
    let path = root.join("relocated");
    let native = path.join("native");
    let marker = native.join(".rotation.json");
    let active = path.join("rasters/active");
    let published = fs::read_dir(&active)?
        .collect::<std::io::Result<Vec<_>>>()?
        .into_iter()
        .map(|entry| entry.path())
        .find(|entry| entry.extension().is_some_and(|ext| ext == "asset"))
        .ok_or("missing published raster")?;
    let image = fs::read(&published)?;
    let inode = fs::metadata(&published)?.ino();
    let stage = active.join(format!(".pending-{}", "f".repeat(64)));
    for (generation, point) in
        [("before-head", RotationPoint::IntentSynced), ("after-head", RotationPoint::HeadSynced)]
    {
        let restored = backup.reopen_with_history(&path, restart.approval.target(), true)?;
        let (mut room, assets, custody) = restored.into_serving_parts();
        room.grant("owner", generation, Some(Role::Reader))?;
        let accepted = room.log_generation_descriptor("owner")?;
        room.interrupt_log_rotation_for_test(point)?;
        assert!(matches!(
            room.rotate_log_generation("owner", generation),
            Err(Error::Contract("test interruption after durable physical prefix"))
        ));
        drop((room, assets, custody));
        let original_intent = fs::read(&marker)?;
        if point == RotationPoint::HeadSynced {
            fs::hard_link(&published, &stage)?;
        }
        assert!(
            backup.restart_activated_room(&path, authenticate()?, "owner", token, restart).is_err()
        );
        assert_eq!(fs::read(&marker)?, original_intent);
        let evidence = root.join(generation);
        let plan = backup.inspect_activated_native_rotation(
            &path,
            &authenticate()?,
            "owner",
            token,
            &ContinuedRasterRotationInspection { restart, minimum: floor, evidence: &evidence },
        )?;
        assert_eq!(plan.next_sequence().to_string(), accepted.next_sequence);
        assert_eq!(fs::read(&marker)?, original_intent);
        let decide = || {
            backup.repair_activated_native_rotation(
                &path,
                &authenticate()?,
                "owner",
                token,
                &ContinuedRasterRotationRepair { restart, plan: &plan, evidence: &evidence },
            )
        };
        let receipt = evidence.join("rotation.json");
        let original_receipt = fs::read(&receipt)?;
        fs::write(&receipt, b"different evidence")?;
        assert!(decide().is_err());
        assert_eq!(fs::read(&marker)?, original_intent);
        fs::write(&receipt, &original_receipt)?;
        if point == RotationPoint::HeadSynced {
            let retained_image = evidence.join("raster.bin");
            assert_eq!(fs::read(&retained_image)?, image);
            fs::write(&retained_image, b"different raster evidence")?;
            assert!(decide().is_err());
            assert_eq!(fs::read(&marker)?, original_intent);
            assert_eq!(fs::read(&stage)?, image);
            fs::write(&retained_image, &image)?;
        }
        assert_eq!(decide()?, ContinuedRasterRotationRepairOutcome::Repaired);
        assert_eq!(decide()?, ContinuedRasterRotationRepairOutcome::AlreadyComplete);
        assert!(!marker.exists());
        assert!(!stage.exists());
        assert_eq!(fs::read(&published)?, image);
        assert_eq!(fs::metadata(&published)?.ino(), inode);
        assert_eq!(fs::metadata(native.join(test_wal_name(generation)))?.len(), 0);
        assert_eq!(restart.authority.current_selection()?, *restart.expected);

        let restored = backup.reopen_with_history(&path, restart.approval.target(), true)?;
        let readback = restored.room().log_generation_descriptor("owner")?;
        assert_eq!(readback.next_sequence, accepted.next_sequence);
        assert_eq!(readback.terminal_digest, accepted.terminal_digest);
        assert_eq!(readback.manifest, plan.successor_manifest());
        assert_eq!(readback.active, generation);
    }
    let (_, reopened, epoch) =
        backup.restart_activated_room(&path, authenticate()?, "owner", token, restart)?;
    let next_cut = reopened.capture("owner", token, &root.join("rotation-restarted"))?;
    assert_eq!(next_cut.source_epoch, epoch);
    assert_eq!(restart.authority.current_selection()?, epoch);
    Ok(())
}

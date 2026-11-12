//! Verify exact rotation recovery while the asset store still has a staging file.
use super::{
    Fixture, RotationCompletionInterruption, RotationPoint, TestResult, authentication,
    check_restart, pending_at, retain, retain_file, sorted_files,
};
use crate::{
    Error, ServerLogGenerationRoomBackup,
    server::{
        SealedNativeRasterUploadRecoveryFiles, SealedNativeRestartBootstrap,
        SealedNativeRotationAndRasterCompletionFiles, SealedNativeRotationAndRasterInspection,
        complete_sealed_native_rotation_and_raster,
        generation_recovery::complete_sealed_rotation_and_raster::complete_sealed_native_rotation_and_raster_with_interruption,
        inspect_sealed_native_raster_upload, inspect_sealed_native_rotation,
        inspect_sealed_native_rotation_and_raster, retire_sealed_native_raster_upload,
    },
};
use std::{fs, os::unix::fs::MetadataExt, path::PathBuf};

fn create_stage(
    fixture: &Fixture,
    published_alias: bool,
) -> TestResult<(PathBuf, PathBuf, Vec<u8>)> {
    let (published, _) = sorted_files(&fixture.bootstrap.operational_root)?
        .into_iter()
        .find(|(path, _)| path.extension().is_some_and(|suffix| suffix == "asset"))
        .ok_or("admitted raster")?;
    let stage = published.with_file_name(format!(".pending-{}", crate::credentials::issue()?));
    if published_alias {
        fs::hard_link(&published, &stage)?;
    } else {
        retain_file(&stage, b"partial raster record")?;
    }
    let bytes = fs::read(&stage)?;
    Ok((published, stage, bytes))
}

async fn inspect(fixture: &Fixture) -> TestResult<SealedNativeRotationAndRasterInspection> {
    let (auth, owner, _) = authentication()?;
    Ok(Box::pin(inspect_sealed_native_rotation_and_raster(
        fixture.selected(),
        None,
        auth,
        "owner",
        &owner,
    ))
    .await?)
}

fn retain_both(
    fixture: &Fixture,
    observed: SealedNativeRotationAndRasterInspection,
    name: &str,
) -> TestResult<(SealedNativeRestartBootstrap, SealedNativeRotationAndRasterCompletionFiles)> {
    let (selected, rotation) = retain(fixture, observed.log, name)?;
    let raster_stage = fixture.source.directory.0.join(format!("{name}.stage"));
    retain_file(&raster_stage, observed.upload.evidence_bytes())?;
    Ok((
        selected,
        SealedNativeRotationAndRasterCompletionFiles {
            rotation,
            raster_stage,
            raster_selection_sha256: observed.upload.selection_sha256,
        },
    ))
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn combined_rotation_and_raster_recovery_preserves_exact_history_at_both_heads() -> TestResult
{
    for (point, published_alias) in
        [(RotationPoint::IntentSynced, true), (RotationPoint::HeadSynced, false)]
    {
        let (fixture, accepted) = Box::pin(pending_at(point)).await?;
        let root = &fixture.bootstrap.operational_root;
        let ledger = sorted_files(&fixture.bootstrap.authority_root)?;
        let (published, stage, raw) = create_stage(&fixture, published_alias)?;
        let inode = fs::metadata(&published)?.ino();
        let before = sorted_files(root)?;
        let (auth, owner, _) = authentication()?;
        assert!(matches!(
            Box::pin(inspect_sealed_native_rotation(
                fixture.selected(),
                None,
                auth,
                "owner",
                &owner
            ))
            .await,
            Err(Error::Contract("operational asset has pending work"))
        ));
        let observed = Box::pin(inspect(&fixture)).await?;
        assert_eq!(observed.upload.published_asset.is_some(), published_alias);
        assert_eq!(observed.upload.evidence_bytes(), raw);
        assert_eq!(observed.log.rotation.head_published, point == RotationPoint::HeadSynced);
        let planned_manifest = observed.log.rotation.after_manifest;
        assert_eq!(sorted_files(root)?, before);

        let (selected, mut retained) = retain_both(&fixture, observed, "wrong-raster-pin")?;
        retained.raster_selection_sha256[0] ^= 1;
        let (auth, owner, _) = authentication()?;
        assert!(matches!(
            Box::pin(complete_sealed_native_rotation_and_raster(
                selected, retained, auth, "owner", &owner
            ))
            .await,
            Err(Error::Contract("combined rotation retained raster evidence differs"))
        ));
        assert_eq!(sorted_files(root)?, before);
        let observed = Box::pin(inspect(&fixture)).await?;
        let (selected, retained) = retain_both(&fixture, observed, "exact-combined")?;
        let saved_raster = retained.raster_stage.clone();
        let (auth, owner, _) = authentication()?;
        let completed = Box::pin(complete_sealed_native_rotation_and_raster(
            selected, retained, auth, "owner", &owner,
        ))
        .await?
        .identity()?;
        let accepted = accepted.identity()?;
        assert_eq!(completed.server.native.source, accepted.server.native.source);
        assert_eq!(completed.server.native.manifest, planned_manifest);
        assert_eq!(completed.server.assets, accepted.server.assets);
        assert_eq!(fs::read(saved_raster)?, raw);
        assert!(!stage.exists());
        assert_eq!(fs::metadata(published)?.ino(), inode);
        assert_eq!(sorted_files(&fixture.bootstrap.authority_root)?, ledger);
        Box::pin(check_restart(&fixture, &completed)).await?;
    }
    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn combined_rotation_and_raster_recovery_reselects_the_head_after_interruption() -> TestResult
{
    let (fixture, accepted) = Box::pin(pending_at(RotationPoint::IntentSynced)).await?;
    let ledger = sorted_files(&fixture.bootstrap.authority_root)?;
    let (published, stage, raw) = create_stage(&fixture, true)?;
    let inode = fs::metadata(&published)?.ino();
    let first = Box::pin(inspect(&fixture)).await?;
    let planned_manifest = first.log.rotation.after_manifest;
    let rotation_pin = first.log.rotation.evidence_sha256;
    let raster_pin = first.upload.selection_sha256;
    let (selected, retained) = retain_both(&fixture, first, "head-stage")?;
    interrupt(selected, retained, RotationPoint::RecoveryHeadPrefix).await?;
    let again = Box::pin(inspect(&fixture)).await?;
    assert_ne!(again.log.rotation.evidence_sha256, rotation_pin);
    assert_eq!(again.upload.selection_sha256, raster_pin);
    let (selected, retained) = retain_both(&fixture, again, "intent-retirement")?;
    let floor = ServerLogGenerationRoomBackup::from_bytes(&fs::read(&retained.rotation.archive)?)?;
    let saved_raster = retained.raster_stage.clone();
    let mut recovery_floor = fixture.selected();
    recovery_floor.expected_current = selected.expected_current.clone();
    interrupt(selected, retained, RotationPoint::IntentRetired).await?;
    assert_eq!(fs::read(&stage)?, raw);
    let (auth, owner, _) = authentication()?;
    let observed = Box::pin(inspect_sealed_native_raster_upload(
        recovery_floor,
        Some(floor),
        auth,
        "owner",
        &owner,
    ))
    .await?;
    let current = observed.state.identity()?;
    assert_eq!(current.server.native.manifest, planned_manifest);
    assert_eq!(current.server.native.source, accepted.identity()?.server.native.source);
    assert_eq!(observed.upload.selection_sha256, raster_pin);
    assert_eq!(observed.upload.evidence_bytes(), raw);
    let archive = fixture.source.directory.0.join("rotated-room.archive");
    retain_file(&archive, &observed.state.into_parts().0.to_bytes()?)?;
    let mut selected = fixture.selected();
    selected.expected_current = current.clone();
    let (auth, owner, _) = authentication()?;
    let restored = Box::pin(retire_sealed_native_raster_upload(
        selected,
        SealedNativeRasterUploadRecoveryFiles {
            archive,
            evidence: saved_raster.clone(),
            selection_sha256: raster_pin,
        },
        auth,
        "owner",
        &owner,
    ))
    .await?;
    assert_eq!(restored.identity()?, current);
    assert_eq!(fs::read(saved_raster)?, raw);
    assert!(!stage.exists());
    assert_eq!(fs::metadata(published)?.ino(), inode);
    assert_eq!(sorted_files(&fixture.bootstrap.authority_root)?, ledger);
    Box::pin(check_restart(&fixture, &current)).await
}

async fn interrupt(
    selected: SealedNativeRestartBootstrap,
    retained: SealedNativeRotationAndRasterCompletionFiles,
    point: RotationPoint,
) -> TestResult {
    let (auth, owner, _) = authentication()?;
    assert!(matches!(
        Box::pin(complete_sealed_native_rotation_and_raster_with_interruption(
            selected,
            retained,
            auth,
            "owner",
            &owner,
            RotationCompletionInterruption { stop_at: Some(point) },
        ))
        .await,
        Err(Error::Contract("test interruption after durable physical prefix"))
    ));
    Ok(())
}

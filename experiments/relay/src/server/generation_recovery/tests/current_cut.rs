//! Full current native and raster selections cannot be replaced by matching document clocks.
use super::super::{ServerLogGenerationRecoveryCoverage, prepare_log_generation_recovery_host};
use super::source::{Source, TestResult, authentication};
use crate::{
    MissingRecoveryRegistration, RecoveryDocumentCredential,
    assets::{asset_id, prepare_asset},
};

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn raster_only_additions_stale_the_current_proof_without_changing_the_native_cut()
-> TestResult {
    let source = Source::new((3, true), true, true, true)?;
    let (auth, owner, _) = authentication()?;
    let handle = prepare_log_generation_recovery_host(
        source.operation("current")?,
        auth,
        source.original_copy()?,
        &source.original.info()?.identity,
        "owner",
        &owner,
    )
    .await?;
    let state = handle.capture_recovery_state("owner", &owner).await?;
    let expected = state.identity()?;
    let (_, inventory) = state.into_parts();
    let ServerLogGenerationRecoveryCoverage::Verified(proof) = handle
        .verify_selected_recovery_state(
            "owner",
            &owner,
            expected.clone(),
            inventory,
            source.protected_records(),
        )
        .await?
    else {
        return Err("full protected input".into());
    };
    let assets = handle.host.assets.clone().ok_or("actual rasters")?;
    handle
        .host
        .transaction(move |room| {
            let mut png = std::io::Cursor::new(Vec::new());
            image::DynamicImage::new_rgb8(4, 5)
                .write_to(&mut png, image::ImageFormat::Png)
                .map_err(|_| crate::Error::Contract("test png encoding"))?;
            let bytes = png.into_inner();
            let mut assets = assets.lock().map_err(|_| crate::Error::NeedsRecovery)?;
            room.put_asset(
                "owner",
                &mut assets,
                prepare_asset(&asset_id(&bytes), "image/png", bytes)?,
            )?;
            Ok(())
        })
        .await?;
    let current = handle.capture_recovery_state("owner", &owner).await?.identity()?;
    let dependencies = handle.capture_asset_recovery_state("owner", &owner).await?;
    assert_eq!(dependencies.current, current);
    assert_eq!(dependencies.references.source, current.server.native);
    assert_eq!(dependencies.format, "breditor/server-log-generation-asset-recovery-state");
    assert_eq!(current.server.native, expected.server.native);
    assert_ne!(current.server.assets, expected.server.assets);
    assert_eq!(current.origin, expected.origin);
    assert!(proof.check_live(&handle, "owner", &owner).await.is_err());
    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn a_later_registration_requires_its_own_protected_secret_in_addition_to_all_originals()
-> TestResult {
    let source = Source::new((3, true), true, true, true)?;
    let (auth, owner, _) = authentication()?;
    let handle = prepare_log_generation_recovery_host(
        source.operation("current")?,
        auth,
        source.original_copy()?,
        &source.original.info()?.identity,
        "owner",
        &owner,
    )
    .await?;
    let state = handle.capture_recovery_state("owner", &owner).await?;
    let expected = state.identity()?;
    let (_, inventory) = state.into_parts();
    let ServerLogGenerationRecoveryCoverage::Verified(proof) = handle
        .verify_selected_recovery_state(
            "owner",
            &owner,
            expected,
            inventory,
            source.protected_records(),
        )
        .await?
    else {
        return Err("full protected input".into());
    };
    let registration = handle.host.transaction(|room| room.register("owner")).await?;
    assert!(proof.check_live(&handle, "owner", &owner).await.is_err());
    let current = handle.capture_recovery_state("owner", &owner).await?;
    let expected = current.identity()?;
    let (_, inventory) = current.into_parts();
    let ServerLogGenerationRecoveryCoverage::Pending { missing } = handle
        .verify_selected_recovery_state(
            "owner",
            &owner,
            expected.clone(),
            inventory.clone(),
            source.protected_records(),
        )
        .await?
    else {
        return Err("missing later credential produced proof".into());
    };
    assert_eq!(
        missing,
        vec![MissingRecoveryRegistration::Document {
            principal: "owner".into(),
            writer: registration.lease.writer.clone()
        }]
    );
    let mut complete = source.protected_records();
    complete.documents.push(RecoveryDocumentCredential {
        principal: "owner".into(),
        writer: registration.lease.writer,
        credential: registration.credential,
    });
    let ServerLogGenerationRecoveryCoverage::Verified(proof) = handle
        .verify_selected_recovery_state("owner", &owner, expected, inventory, complete)
        .await?
    else {
        return Err("complete current credentials missing".into());
    };
    proof.check_live(&handle, "owner", &owner).await?;
    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn streamed_current_archive_and_inventory_match_and_refuse_output_failures() -> TestResult {
    use crate::ServerLogGenerationRoomBackupFile;
    use std::{fs, io::Seek, os::unix::fs::OpenOptionsExt};

    let source = Source::new((3, true), true, true, true)?;
    let (auth, owner, _) = authentication()?;
    let handle = prepare_log_generation_recovery_host(
        source.operation("streamed")?,
        auth,
        source.original_copy()?,
        &source.original.info()?.identity,
        "owner",
        &owner,
    )
    .await?;
    let buffered = handle.capture_recovery_state("owner", &owner).await?;
    let expected = buffered.identity()?;
    let (buffered, expected_inventory) = buffered.into_parts();
    let path = source.directory.0.join("streamed.backup");
    let mut output =
        fs::OpenOptions::new().create_new(true).read(true).write(true).mode(0o600).open(&path)?;
    output.seek(std::io::SeekFrom::Start(19))?;

    assert!(
        handle
            .capture_recovery_state_to("owner", "wrong-token", output.try_clone()?)
            .await
            .is_err()
    );
    assert_eq!(output.metadata()?.len(), 0);
    let (identity, inventory) =
        handle.capture_recovery_state_to("owner", &owner, output.try_clone()?).await?;
    output.sync_all()?;
    assert_eq!(identity, expected);
    assert_eq!(inventory.to_json(), expected_inventory.to_json());
    let disk = ServerLogGenerationRoomBackupFile::open(fs::File::open(&path)?, &identity.server)?;
    assert_eq!(disk.info(), buffered.info()?);
    assert_eq!(fs::read(&path)?, buffered.to_bytes()?);
    assert!(handle.capture_recovery_state_to("owner", &owner, output).await.is_err());

    let path = source.directory.0.join("read-only-output");
    drop(fs::File::create_new(&path)?);
    assert!(
        handle.capture_recovery_state_to("owner", &owner, fs::File::open(&path)?).await.is_err()
    );
    assert_eq!(fs::metadata(&path)?.len(), 0);
    let (current, inventory) = handle.capture_recovery_identity("owner", &owner).await?;
    assert_eq!(current, expected);
    assert_eq!(inventory.to_json(), expected_inventory.to_json());
    Ok(())
}

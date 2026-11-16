//! Restore and activate a room at the actual live raster-count ceiling.
use super::{POLICY, Source, TestResult, auth, client_uploads::pending_raster_archive};
use crate::{
    Error, RecoveryDocumentCredential, RecoveryRegistrationCredentials,
    RelaySegmentClientUploadArchive, RelaySegmentClientUploadPin,
    assets::{MAX_ASSETS, asset_id, prepare_asset},
    server::{
        RelaySegmentHandoverApproval, RelaySegmentHandoverInputCoverage,
        ServerRecoveryAssetProvider,
    },
};
use breditor_collab_feasibility::rich_replica::VersionAssetReference;
use std::{
    fs::{self, File},
    io::{Cursor, Read},
    sync::Arc,
};

struct SeedRaster(String);

impl ServerRecoveryAssetProvider for SeedRaster {
    fn check(&self) -> crate::Result<()> {
        Ok(())
    }

    fn resolve(&self, pair: &VersionAssetReference) -> crate::Result<Option<String>> {
        Ok((pair.asset == "asset" && pair.generation == "generation").then(|| self.0.clone()))
    }
}

fn pixel(index: usize) -> TestResult<Vec<u8>> {
    let [first, second, ..] = index.to_le_bytes();
    let color = image::Rgba([first, second, 180, 255]);
    let mut png = Cursor::new(Vec::new());
    image::DynamicImage::ImageRgba8(image::RgbaImage::from_pixel(1, 1, color))
        .write_to(&mut png, image::ImageFormat::Png)?;
    Ok(png.into_inner())
}

pub(super) async fn fill_raster_store(source: &Source, count: usize) -> TestResult<String> {
    let prepared = (0..count)
        .map(|index| -> TestResult<_> {
            let bytes = pixel(index)?;
            Ok(prepare_asset(&asset_id(&bytes), "image/png", bytes)?)
        })
        .collect::<TestResult<Vec<_>>>()?;
    let seed = asset_id(&pixel(0)?);
    let store = source.handle.host.assets.clone().ok_or("raster owner")?;
    source
        .handle
        .host
        .transaction(move |room| {
            let mut store = store.lock().map_err(|_| Error::NeedsRecovery)?;
            for asset in prepared {
                assert!(!room.put_asset("owner", &mut store, asset)?.duplicate);
            }
            Ok(())
        })
        .await?;
    Ok(seed)
}

#[tokio::test]
async fn full_raster_store_activates_with_original_upload_bytes_and_no_new_receipt() -> TestResult {
    let source = Source::open()?;
    let seed = pixel(0)?;
    let pending = pixel(MAX_ASSETS)?;
    let seed_id = asset_id(&seed);
    let pending_id = asset_id(&pending);
    fill_raster_store(&source, MAX_ASSETS).await?;
    let registration = source.handle.host.transaction(|room| room.register("owner")).await?;
    let before = source.handle.storage_capacity("owner", &source.token).await?;
    assert_eq!(before.rasters.assets_remaining, 0);
    let backup = source.capture("at-raster-ceiling")?;

    let selected = |name: &str, width| -> TestResult<_> {
        let bytes = pending_raster_archive(&pending, width)?;
        let path = source.parent.join(name);
        fs::write(&path, &bytes)?;
        let queue = RelaySegmentClientUploadArchive::open(
            File::open(path)?,
            RelaySegmentClientUploadPin {
                writer: registration.lease.writer.clone(),
                bytes: bytes.len() as u64,
                sha256: asset_id(&bytes)[7..].into(),
            },
        )?;
        Ok((queue, bytes))
    };
    let (input, bytes) = selected("pending.uploads", 1)?;
    let inputs = [input];
    let would_overfill = source.parent.join("would-overfill");
    assert!(matches!(
        backup.restore_with_client_upload_archives(&would_overfill, "staged", POLICY, &inputs),
        Err(Error::Contract("restored raster union budget"))
    ));
    assert!(!would_overfill.exists());
    let malformed = source.parent.join("mismatched-raster");
    assert!(matches!(
        backup.restore_retaining_client_uploads(
            &malformed,
            "staged",
            POLICY,
            &[selected("wrong-width.uploads", 2)?.0],
            &[],
            &[],
        ),
        Err(Error::Contract("client raster selected metadata differs"))
    ));
    assert!(!malformed.exists());
    assert_eq!(source.handle.storage_capacity("owner", &source.token).await?, before);

    let path = source.parent.join("target");
    let target =
        backup.restore_retaining_client_uploads(&path, "target", POLICY, &inputs, &[], &[])?;
    assert_eq!(target.components().1.count(), MAX_ASSETS);
    assert!(target.components().1.get(&pending_id)?.is_none());
    drop(target);
    let mut target = backup.reopen(&path, POLICY)?;
    let writer = registration.lease.writer;
    let mut actual = Vec::new();
    target
        .open_client_upload_archive(&writer)?
        .ok_or("retained queue")?
        .read_to_end(&mut actual)?;
    assert_eq!(actual, bytes);
    let credentials = RecoveryRegistrationCredentials {
        documents: vec![RecoveryDocumentCredential {
            principal: "owner".into(),
            writer,
            credential: registration.credential,
        }],
        ..RecoveryRegistrationCredentials::default()
    };
    let authentication = auth(&source.token)?;
    let provider: Arc<dyn ServerRecoveryAssetProvider> = Arc::new(SeedRaster(seed_id.clone()));
    let RelaySegmentHandoverInputCoverage::Verified(verified) = target.verify_handover_inputs(
        &authentication,
        "owner",
        &source.token,
        &credentials,
        &provider,
    )?
    else {
        return Err("retained-only queue should allow a complete handover".into());
    };
    assert!(verified.report().client_rasters.is_empty());
    assert_eq!(verified.report().assets.len(), 1);
    let approval = RelaySegmentHandoverApproval::select_verified(
        &target,
        &verified,
        source.lease.selection(),
    )?;
    let (router, handle, epoch) = source.handle.commit_verified_relay_segment_handover(
        "owner",
        &source.token,
        target,
        authentication,
        &approval,
        &verified,
    )?;
    let store = handle.host.assets.clone().ok_or("recovered raster owner")?;
    handle
        .host
        .transaction(move |room| {
            let mut assets = store.lock().map_err(|_| Error::NeedsRecovery)?;
            assert_eq!(
                room.read_asset("owner", &assets, &seed_id)?.ok_or(Error::NeedsRecovery)?.bytes,
                seed
            );
            assert!(matches!(
                room.put_asset(
                    "owner",
                    &mut assets,
                    prepare_asset(&pending_id, "image/png", pending)?
                ),
                Err(Error::Contract("asset store budget"))
            ));
            assert!(
                room.put_asset("owner", &mut assets, prepare_asset(&seed_id, "image/png", seed)?)?
                    .duplicate
            );
            Ok(())
        })
        .await?;
    assert_eq!(handle.storage_capacity("owner", &source.token).await?.rasters, before.rasters);
    drop((router, handle));
    let target = backup.reopen(&path, POLICY)?;
    let (_, _, resumed) = target.resume_handover(
        auth(&source.token)?,
        "owner",
        &source.token,
        &source.authority,
        &approval,
        &epoch,
    )?;
    assert_ne!(resumed, epoch);
    Ok(())
}

use super::{POLICY, Source, TestResult, auth};
use crate::{
    Error, RecoveryRegistrationCredentials, Role,
    assets::{asset_id, prepare_asset},
    server::{
        LogGenerationHandoverStatus, RelaySegmentHandoverApproval,
        RelaySegmentHandoverInputCoverage, RelaySegmentPortableSeal, RelaySegmentRetainedBackup,
        RoomDeploymentAuthority, SealedRelaySegmentActivation, ServerRecoveryAssetProvider,
        generation_backup::durable::{Interruption, Point},
    },
};
use breditor_collab_feasibility::rich_replica::VersionAssetReference;
use std::{fs, io::Cursor, sync::Arc};

struct SeedAsset(String);

impl ServerRecoveryAssetProvider for SeedAsset {
    fn check(&self) -> crate::Result<()> {
        Ok(())
    }

    fn resolve(&self, reference: &VersionAssetReference) -> crate::Result<Option<String>> {
        Ok((reference.asset == "asset" && reference.generation == "generation")
            .then(|| self.0.clone()))
    }
}

#[tokio::test]
async fn relocated_bundle_activates_after_a_durable_seal_with_a_lost_reply() -> TestResult {
    let source = Source::open()?;
    let store = source.handle.host.assets.clone().ok_or("source assets")?;
    let raster = source
        .handle
        .host
        .transaction(move |room| {
            let mut png = Cursor::new(Vec::new());
            image::DynamicImage::new_rgba8(1, 1)
                .write_to(&mut png, image::ImageFormat::Png)
                .map_err(std::io::Error::other)?;
            let bytes = png.into_inner();
            let id = asset_id(&bytes);
            let mut store = store.lock().map_err(|_| Error::NeedsRecovery)?;
            room.put_asset("owner", &mut store, prepare_asset(&id, "image/png", bytes)?)?;
            Ok(id)
        })
        .await?;
    let provider: Arc<dyn ServerRecoveryAssetProvider> = Arc::new(SeedAsset(raster));
    let stale_path = source.parent.join("stale-bundle");
    let stale = RelaySegmentPortableSeal::select(source.handle.capture_portable_relay_segment(
        "owner",
        &source.token,
        &stale_path,
    )?)?;
    source
        .handle
        .host
        .transaction(|room| room.grant("owner", "reader-after-first-backup", Some(Role::Reader)))
        .await?;
    assert!(matches!(
        source.handle.seal_portable_relay_segment("owner", &source.token, &stale_path, &stale),
        Err(Error::Contract("portable relay seal source cut advanced"))
    ));
    assert_eq!(source.authority.current_selection()?, source.lease.selection());

    let path = source.parent.join("sealed-bundle");
    let intent = RelaySegmentPortableSeal::select(source.handle.capture_portable_relay_segment(
        "owner",
        &source.token,
        &path,
    )?)?;
    let saved = serde_json::to_vec(&intent)?;
    assert_eq!(intent.status(&source.authority)?, LogGenerationHandoverStatus::Prepared);
    let after_write = Interruption { stop: Some(Point::EpochWritten), ..Interruption::default() };
    assert!(matches!(
        source.handle.seal_portable_relay_segment_with_interruption(
            "owner",
            &source.token,
            &path,
            &intent,
            &after_write,
        ),
        Err(Error::Contract("injected durable handover interruption"))
    ));
    assert!(matches!(
        source.handle.host.transaction(|room| room.catchup("owner")).await,
        Err(Error::Lease)
    ));
    let identity = source.authority.identity();
    drop((source.handle, source.lease, source.authority));
    let moved = source.parent.join("relocated-bundle");
    fs::rename(&path, &moved)?;

    let seal: RelaySegmentPortableSeal = serde_json::from_slice(&saved)?;
    let authority = RoomDeploymentAuthority::open(&source.parent.join("authority"), &identity)?;
    let sealed = seal.planned_selection()?;
    assert_eq!(seal.status(&authority)?, LogGenerationHandoverStatus::Sealed);
    assert_eq!(authority.current_selection()?, sealed);
    let bundle = RelaySegmentRetainedBackup::open_portable(&moved, seal.backup())?;
    let destination = source.parent.join("relocated-room");
    let mut target = bundle.restore(&destination, "relocated", POLICY)?;
    let authentication = auth(&source.token)?;
    let coverage = target.verify_handover_inputs(
        &authentication,
        "owner",
        &source.token,
        &RecoveryRegistrationCredentials::default(),
        &provider,
    )?;
    let RelaySegmentHandoverInputCoverage::Verified(inputs) = coverage else {
        return Err("portable relocation inputs remained pending".into());
    };
    let approval = RelaySegmentHandoverApproval::select_verified(&target, &inputs, sealed)?;
    let (router, handle, selection) = target.activate_sealed_portable_relay(
        authentication,
        "owner",
        &source.token,
        SealedRelaySegmentActivation {
            authority: &authority,
            seal: &seal,
            approval: &approval,
            inputs: &inputs,
        },
    )?;
    assert_eq!(selection, approval.planned_selection()?);
    handle
        .host
        .transaction(|room| {
            room.catchup("reader-after-first-backup")?;
            room.grant("owner", "reader-after-relocation", Some(Role::Reader))
        })
        .await?;
    drop((router, handle));
    let reopened = bundle.backup().reopen(&destination, POLICY)?;
    let (_, resumed, fresh) = reopened.resume_handover(
        auth(&source.token)?,
        "owner",
        &source.token,
        &authority,
        &approval,
        &selection,
    )?;
    assert_ne!(fresh, selection);
    assert_eq!(seal.status(&authority)?, LogGenerationHandoverStatus::Sealed);
    resumed.host.transaction(|room| room.catchup("reader-after-relocation")).await?;
    Ok(())
}

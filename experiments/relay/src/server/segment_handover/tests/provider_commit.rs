//! A held provider may lose authority while the previous room cut is being checked.
use super::{POLICY, Source, TestResult, auth};
use crate::{
    Error, RecoveryRegistrationCredentials, Result,
    assets::{asset_id, prepare_asset},
    server::{
        RelaySegmentHandoverApproval, RelaySegmentHandoverInputCoverage,
        ServerRecoveryAssetProvider,
        deployment_fence::commit_segment_handover,
        generation_backup::durable::{Barrier, Interruption, Point},
    },
};
use breditor_collab_feasibility::rich_replica::VersionAssetReference;
use std::{
    io::Cursor,
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, Ordering},
        mpsc,
    },
    time::Duration,
};

struct Provider {
    raster: String,
    alternate: String,
    revoked: AtomicBool,
    remapped: AtomicBool,
}

#[derive(Clone, Copy)]
enum Change {
    Revocation,
    Remapping,
}

impl Change {
    fn apply(self, provider: &Provider) {
        match self {
            Self::Revocation => provider.revoked.store(true, Ordering::Release),
            Self::Remapping => provider.remapped.store(true, Ordering::Release),
        }
    }

    fn expected_error(self) -> &'static str {
        match self {
            Self::Revocation => "server asset provider guard refused",
            Self::Remapping => "relay segment handover provider inputs changed",
        }
    }
}

impl ServerRecoveryAssetProvider for Provider {
    fn check(&self) -> Result<()> {
        if self.revoked.load(Ordering::Acquire) { Err(Error::Permission) } else { Ok(()) }
    }

    fn resolve(&self, reference: &VersionAssetReference) -> Result<Option<String>> {
        assert_eq!(reference.asset, "asset");
        assert_eq!(reference.generation, "generation");
        let asset =
            if self.remapped.load(Ordering::Acquire) { &self.alternate } else { &self.raster };
        Ok(Some(asset.clone()))
    }
}

#[tokio::test]
async fn provider_revoked_after_source_cut_comparison_cannot_append_a_serving_epoch() -> TestResult
{
    check_late_provider_change(Change::Revocation).await
}

#[tokio::test]
async fn provider_remapped_after_source_cut_comparison_cannot_append_a_serving_epoch() -> TestResult
{
    check_late_provider_change(Change::Remapping).await
}

async fn admit_fixture_raster(source: &Source, red: u8) -> TestResult<String> {
    let mut bytes = Cursor::new(Vec::new());
    let image = image::RgbaImage::from_pixel(1, 1, image::Rgba([red, 20, 40, 255]));
    image::DynamicImage::ImageRgba8(image).write_to(&mut bytes, image::ImageFormat::Png)?;
    let bytes = bytes.into_inner();
    let raster = asset_id(&bytes);
    let admitted = prepare_asset(&raster, "image/png", bytes)?;
    let store = source.handle.host.assets.clone().ok_or("source assets")?;
    source
        .handle
        .host
        .transaction(move |room| {
            let mut store = store.lock().map_err(|_| Error::NeedsRecovery)?;
            room.put_asset("owner", &mut store, admitted)
        })
        .await?;
    Ok(raster)
}

async fn check_late_provider_change(change: Change) -> TestResult {
    let source = Source::open()?;
    let raster = admit_fixture_raster(&source, 20).await?;
    let alternate = admit_fixture_raster(&source, 200).await?;
    let control = Arc::new(Provider {
        raster: raster.clone(),
        alternate: alternate.clone(),
        revoked: AtomicBool::new(false),
        remapped: AtomicBool::new(false),
    });
    let provider: Arc<dyn ServerRecoveryAssetProvider> = control.clone();
    let backup = source.capture("provider-cut")?;
    let path = source.parent.join("provider-target");
    let mut target = backup.restore(&path, "new", POLICY)?;
    let credentials = RecoveryRegistrationCredentials::default();
    let RelaySegmentHandoverInputCoverage::Verified(inputs) = target.verify_handover_inputs(
        &auth(&source.token)?,
        "owner",
        &source.token,
        &credentials,
        &provider,
    )?
    else {
        return Err("the exact predecessor raster was not verified".into());
    };
    assert_eq!(inputs.report().resolutions.len(), 1);
    let previous = source.lease.selection();
    let approval =
        RelaySegmentHandoverApproval::select_verified(&target, &inputs, previous.clone())?;
    let (entered, reached) = mpsc::channel();
    let (release, released) = mpsc::channel();
    let pause = Interruption {
        barrier: Some(Barrier {
            point: Point::SourceChecked,
            entered,
            release: Mutex::new(released),
        }),
        ..Interruption::default()
    };
    let old = source.handle.host.clone();
    let approved = approval.clone();
    let worker = tokio::task::spawn_blocking(move || {
        commit_segment_handover(&old, "owner", &target, &approved, Some(&inputs), &pause)
            .map(|lease| lease.selection())
    });
    reached.recv_timeout(Duration::from_secs(10))?;
    change.apply(&control);
    release.send(())?;
    let result = worker.await?;
    assert_eq!(source.authority.current_selection()?, previous);
    assert!(matches!(result, Err(Error::Contract(message)) if message == change.expected_error()));
    source.lease.check()?;

    let provider: Arc<dyn ServerRecoveryAssetProvider> = Arc::new(Provider {
        raster,
        alternate,
        revoked: AtomicBool::new(false),
        remapped: AtomicBool::new(false),
    });
    let mut target = backup.reopen(&path, POLICY)?;
    let RelaySegmentHandoverInputCoverage::Verified(inputs) = target.verify_handover_inputs(
        &auth(&source.token)?,
        "owner",
        &source.token,
        &credentials,
        &provider,
    )?
    else {
        return Err("valid provider could not re-verify the original restored cut".into());
    };
    let (_, _, committed) = source.handle.commit_verified_relay_segment_handover(
        "owner",
        &source.token,
        target,
        auth(&source.token)?,
        &approval,
        &inputs,
    )?;
    assert_eq!(committed, approval.planned_selection()?);
    assert_eq!(source.authority.current_selection()?, committed);
    Ok(())
}

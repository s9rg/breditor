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

struct RevocableProvider {
    raster: String,
    revoked: AtomicBool,
}

impl ServerRecoveryAssetProvider for RevocableProvider {
    fn check(&self) -> Result<()> {
        if self.revoked.load(Ordering::Acquire) { Err(Error::Permission) } else { Ok(()) }
    }

    fn resolve(&self, reference: &VersionAssetReference) -> Result<Option<String>> {
        assert_eq!(reference.asset, "asset");
        assert_eq!(reference.generation, "generation");
        Ok(Some(self.raster.clone()))
    }
}

#[tokio::test]
async fn provider_revoked_after_source_cut_comparison_cannot_append_a_serving_epoch() -> TestResult
{
    let source = Source::open()?;
    let mut bytes = Cursor::new(Vec::new());
    image::DynamicImage::new_rgba8(1, 1).write_to(&mut bytes, image::ImageFormat::Png)?;
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

    let control = Arc::new(RevocableProvider { raster, revoked: AtomicBool::new(false) });
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
    control.revoked.store(true, Ordering::Release);
    release.send(())?;
    let result = worker.await?;
    assert_eq!(source.authority.current_selection()?, previous);
    assert!(matches!(result, Err(Error::Contract("server asset provider guard refused"))));
    source.lease.check()?;

    control.revoked.store(false, Ordering::Release);
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

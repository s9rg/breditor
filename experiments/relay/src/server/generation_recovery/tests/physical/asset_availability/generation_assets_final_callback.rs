//! The repaired final-callback law also holds for genuine generation A/B/C provider proofs.
use super::super::super::source::TestResult;
use super::fixture::{Fixture, raster};
use crate::{
    Error,
    assets::asset_id,
    server::{ServerLogGenerationRecoveryAssetCoverage, ServerRecoveryAssetProvider},
};
use breditor_collab_feasibility::rich_replica::VersionAssetReference;
use std::{
    fs,
    io::{Cursor, Write},
    path::PathBuf,
    sync::{
        Arc,
        atomic::{AtomicBool, AtomicUsize, Ordering},
    },
};

struct Guard {
    path: PathBuf,
    content: String,
    calls: AtomicUsize,
    mutate_at: AtomicUsize,
    mutated: AtomicBool,
}
impl ServerRecoveryAssetProvider for Guard {
    fn check(&self) -> crate::Result<()> {
        let observed = self.calls.fetch_add(1, Ordering::SeqCst) + 1;
        if observed == self.mutate_at.load(Ordering::SeqCst) {
            let mut file = fs::OpenOptions::new().append(true).open(&self.path)?;
            file.write_all(b"!")?;
            file.sync_all()?;
            self.mutated.store(true, Ordering::SeqCst);
        }
        Ok(())
    }
    fn resolve(&self, reference: &VersionAssetReference) -> crate::Result<Option<String>> {
        if reference.asset != "asset"
            || !matches!(reference.generation.as_str(), "generation" | "provider-current")
        {
            return Err(Error::Contract("unexpected fixture opaque pair"));
        }
        Ok(Some(self.content.clone()))
    }
}
async fn workflow(complete: bool, raster_source: bool) -> TestResult {
    let fixture = Box::pin(Fixture::new((3, true), true)).await?;
    let native = super::generation_assets_fixture::native(&fixture).await?;
    let marker =
        fixture.destination.join(if raster_source { ".rasters.json" } else { ".native.json" });
    let component: serde_json::Value = serde_json::from_slice(&fs::read(marker)?)?;
    let mut directory =
        fixture.destination.join(component["directory"].as_str().ok_or("actual component")?);
    if !raster_source {
        let selected: serde_json::Value =
            serde_json::from_slice(&fs::read(directory.join(".component.json"))?)?;
        directory = directory.join(selected["directory"].as_str().ok_or("actual native data")?);
    }
    let path = directory.join(if raster_source { "store.json" } else { ".head.json" });
    let content = if complete {
        asset_id(&raster(image::ImageFormat::Png)?)
    } else {
        let mut bytes = Cursor::new(Vec::new());
        image::DynamicImage::new_rgb8(9, 11).write_to(&mut bytes, image::ImageFormat::Png)?;
        asset_id(&bytes.into_inner())
    };
    let guard = Arc::new(Guard {
        path,
        content,
        calls: AtomicUsize::new(0),
        mutate_at: AtomicUsize::new(usize::MAX),
        mutated: AtomicBool::new(false),
    });
    match fixture
        .local()
        .verify_recovery_asset_availability("owner", &fixture.owner, native.clone(), guard.clone())
        .await?
    {
        ServerLogGenerationRecoveryAssetCoverage::Verified(_) if complete => {}
        ServerLogGenerationRecoveryAssetCoverage::Pending { missing, .. }
            if !complete && missing.len() == 2 => {}
        _ => return Err("baseline generation coverage differs".into()),
    }
    let last = guard.calls.swap(0, Ordering::SeqCst);
    assert!(last > 0);
    guard.mutate_at.store(last, Ordering::SeqCst);
    let before = fs::read(&guard.path)?;
    let result = fixture
        .local()
        .verify_recovery_asset_availability("owner", &fixture.owner, native.clone(), guard.clone())
        .await;
    assert!(guard.mutated.load(Ordering::SeqCst));
    let after = fs::read(&guard.path)?;
    assert_eq!(after, [before.as_slice(), b"!"].concat());
    assert!(result.is_err(), "last successful callback must not publish stale generation coverage");
    assert!(fixture.local().capture_recovery_state("owner", &fixture.owner).await.is_err());
    assert_eq!(fs::read(&guard.path)?, after, "never repair the changed component");
    Ok(())
}
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn generation_ready_native_change_on_last_callback_refuses() -> TestResult {
    Box::pin(workflow(true, false)).await
}
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn generation_ready_raster_change_on_last_callback_refuses() -> TestResult {
    Box::pin(workflow(true, true)).await
}
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn generation_pending_native_change_on_last_callback_refuses() -> TestResult {
    Box::pin(workflow(false, false)).await
}
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn generation_pending_raster_change_on_last_callback_refuses() -> TestResult {
    Box::pin(workflow(false, true)).await
}

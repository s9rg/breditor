//! No new read may retarget a frozen server proof or publish after its last callback changed C.
use super::{Network, Setup, TestResult, body, query};
use crate::{
    Error,
    server::{
        PhysicalServerRecoveryAssetCoverage, ServerRecoveryAssetProvider,
        prepare_physical_room_recovery_control,
    },
};
use breditor_collab_feasibility::rich_replica::VersionAssetReference;
use std::{
    fs,
    io::Write,
    path::PathBuf,
    sync::{
        Arc,
        atomic::{AtomicBool, AtomicUsize, Ordering},
    },
};

struct Guard {
    base: Arc<dyn ServerRecoveryAssetProvider>,
    mapping: Arc<std::sync::Mutex<super::super::super::provider::Mapping>>,
    path: Option<PathBuf>,
    calls: AtomicUsize,
    mutate_at: AtomicUsize,
    mutated: AtomicBool,
}
impl ServerRecoveryAssetProvider for Guard {
    fn check(&self) -> crate::Result<()> {
        self.base.check()?;
        if self.calls.fetch_add(1, Ordering::SeqCst) + 1 == self.mutate_at.load(Ordering::SeqCst) {
            if let Some(path) = &self.path {
                let mut file = fs::OpenOptions::new().append(true).open(path)?;
                file.write_all(b"!")?;
                file.sync_all()?;
            } else {
                let mut mapping = self.mapping.lock().map_err(|_| Error::NeedsRecovery)?;
                let target = mapping.flip_target.clone();
                for value in mapping.pairs.values_mut() {
                    value.clone_from(&target);
                }
            }
            self.mutated.store(true, Ordering::SeqCst);
        }
        self.base.check()
    }
    fn resolve(&self, reference: &VersionAssetReference) -> crate::Result<Option<String>> {
        self.base.resolve(reference)
    }
}
async fn reprepare(setup: &mut Setup, path: Option<PathBuf>) -> TestResult<Arc<Guard>> {
    drop(setup.control.take());
    let guard = Arc::new(Guard {
        base: setup.provider.clone(),
        mapping: setup.mapping.clone(),
        path,
        calls: AtomicUsize::new(0),
        mutate_at: AtomicUsize::new(usize::MAX),
        mutated: AtomicBool::new(false),
    });
    let provider: Arc<dyn ServerRecoveryAssetProvider> = guard.clone();
    let PhysicalServerRecoveryAssetCoverage::Verified(proof) = setup
        .fixture
        .host()
        .verify_recovery_asset_availability(
            "owner",
            &setup.fixture.owner,
            setup.fixture.native.clone(),
            provider.clone(),
        )
        .await?
    else {
        return Err("actual guarded asset proof".into());
    };
    setup.proof = Arc::new(proof);
    let (router, control) = prepare_physical_room_recovery_control(
        setup.fixture.host().clone(),
        setup.proof.clone(),
        provider.clone(),
        "owner",
        &setup.fixture.owner,
        super::super::fixture::operators(&setup.token)?,
    )
    .await?;
    setup.provider = provider;
    setup.router = router;
    setup.control = Some(control);
    guard.calls.store(0, Ordering::SeqCst);
    Ok(guard)
}
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn new_union_must_not_retarget_server_mapping_after_the_initial_frozen_proof_check()
-> TestResult {
    let mut setup = Box::pin(Setup::new((3, true), true)).await?;
    let guard = Box::pin(reprepare(&mut setup, None)).await?;
    setup
        .proof
        .check_live(setup.fixture.host(), "owner", &setup.fixture.owner, setup.provider.clone())
        .await?;
    let initial = guard.calls.swap(0, Ordering::SeqCst);
    assert!(initial > 0);
    guard.mutate_at.store(initial + 1, Ordering::SeqCst);
    let server = Network::start(setup.router.clone()).await?;
    let result =
        query(&server, &setup, &body(&setup, serde_json::json!([]), serde_json::json!([]))).await?;
    assert!(guard.mutated.load(Ordering::SeqCst), "Actual first union callback must execute");
    assert_eq!(
        result.status, 400,
        "A stable replacement mapping cannot retarget the frozen server-only proof"
    );
    assert_eq!(
        setup
            .fixture
            .host()
            .capture_recovery_state("owner", &setup.fixture.owner)
            .await?
            .identity()?,
        setup.fixture.expected
    );
    server.stop().await?;
    Ok(())
}
fn component(setup: &Setup, raster: bool) -> TestResult<PathBuf> {
    let marker =
        setup.fixture.destination.join(if raster { ".rasters.json" } else { ".native.json" });
    let selected: serde_json::Value = serde_json::from_slice(&fs::read(marker)?)?;
    let mut directory = setup
        .fixture
        .destination
        .join(selected["directory"].as_str().ok_or("component directory")?);
    if !raster {
        let selected: serde_json::Value =
            serde_json::from_slice(&fs::read(directory.join(".component.json"))?)?;
        directory = directory.join(selected["directory"].as_str().ok_or("native directory")?);
    }
    Ok(directory.join(if raster { "store.json" } else { ".head.json" }))
}
async fn final_callback(raster: bool, pending: bool) -> TestResult {
    let mut setup = Box::pin(Setup::new((3, true), true)).await?;
    let path = component(&setup, raster)?;
    let before = fs::read(&path)?;
    let guard = Box::pin(reprepare(&mut setup, Some(path.clone()))).await?;
    let server = Network::start(setup.router.clone()).await?;
    let uploads = if pending {
        serde_json::json!([format!("sha256:{}", "0".repeat(64))])
    } else {
        serde_json::json!([])
    };
    let request = body(&setup, serde_json::json!([]), uploads);
    let baseline = query(&server, &setup, &request).await?;
    assert_eq!(baseline.status, 200);
    let read: serde_json::Value = serde_json::from_slice(&baseline.body)?;
    assert_eq!(read["missing"].as_array().ok_or("missing")?.len(), usize::from(pending));
    let last = guard.calls.swap(0, Ordering::SeqCst);
    assert!(last > 0);
    guard.mutate_at.store(last, Ordering::SeqCst);
    let result = query(&server, &setup, &request).await?;
    assert!(guard.mutated.load(Ordering::SeqCst));
    assert_ne!(
        result.status, 200,
        "Final callback mutation must not publish stale Ready or Pending"
    );
    let after = fs::read(&path)?;
    assert_eq!(after, [before.as_slice(), b"!"].concat());
    assert!(
        setup.fixture.host().capture_recovery_state("owner", &setup.fixture.owner).await.is_err()
    );
    assert_eq!(fs::read(path)?, after, "Refusal never repairs or overwrites the changed source");
    server.stop().await?;
    Ok(())
}
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn ready_native_last_callback_change_refuses() -> TestResult {
    Box::pin(final_callback(false, false)).await
}
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn ready_raster_last_callback_change_refuses() -> TestResult {
    Box::pin(final_callback(true, false)).await
}
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn pending_native_last_callback_change_refuses() -> TestResult {
    Box::pin(final_callback(false, true)).await
}
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn pending_raster_last_callback_change_refuses() -> TestResult {
    Box::pin(final_callback(true, true)).await
}

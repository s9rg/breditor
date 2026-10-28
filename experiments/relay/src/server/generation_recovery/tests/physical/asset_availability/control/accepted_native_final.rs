//! The last actual provider callback must not publish native payloads after
//! changing a selected native/raster source. Test-owned bytes are restored only
//! after the refused request so fixture cleanup can complete normally.
use super::super::super::super::source::TestResult;
use super::{
    fixture::{Setup, operators},
    network::{Network, Request},
};
use crate::server::{
    PhysicalServerRecoveryAssetCoverage, ServerRecoveryAssetProvider,
    prepare_physical_room_recovery_control,
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
    path: PathBuf,
    calls: AtomicUsize,
    mutate_at: AtomicUsize,
    mutated: AtomicBool,
}
impl ServerRecoveryAssetProvider for Guard {
    fn check(&self) -> crate::Result<()> {
        self.base.check()?;
        if self.calls.fetch_add(1, Ordering::SeqCst) + 1 == self.mutate_at.load(Ordering::SeqCst) {
            let mut file = fs::OpenOptions::new().append(true).open(&self.path)?;
            file.write_all(b"!")?;
            file.sync_all()?;
            self.mutated.store(true, Ordering::SeqCst);
        }
        self.base.check()
    }
    fn resolve(&self, reference: &VersionAssetReference) -> crate::Result<Option<String>> {
        self.base.resolve(reference)
    }
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
async fn last_callback(raster: bool, original_review: bool) -> TestResult {
    let mut setup = Box::pin(Setup::new((3, true), true)).await?;
    let path = component(&setup, raster)?;
    let before = fs::read(&path)?;
    drop(setup.control.take());
    let guard = Arc::new(Guard {
        base: setup.provider.clone(),
        path: path.clone(),
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
        return Err("genuine native provider proof".into());
    };
    setup.proof = Arc::new(proof);
    let (router, control) = prepare_physical_room_recovery_control(
        setup.fixture.host().clone(),
        setup.proof.clone(),
        provider.clone(),
        "owner",
        &setup.fixture.owner,
        operators(&setup.token)?,
    )
    .await?;
    setup.router = router;
    setup.provider = provider;
    setup.control = Some(control);
    let original_body =
        if original_review { Some(super::original_review::body(&setup).await?) } else { None };
    guard.calls.store(0, Ordering::SeqCst);
    setup
        .proof
        .check_live(setup.fixture.host(), "owner", &setup.fixture.owner, setup.provider.clone())
        .await?;
    let one = guard.calls.swap(0, Ordering::SeqCst);
    assert!(one > 0);
    guard.mutate_at.store(one * 2, Ordering::SeqCst);
    let server = Network::start(setup.router.clone()).await?;
    let request = Request {
        path: if original_review {
            "/recovery/physical/v1/review/authorizations/read"
        } else {
            "/recovery/physical/v1/accepted/read"
        },
        ..Request::check(&setup.token)
    };
    let input = if let Some(body) = original_body {
        serde_json::to_vec(&body)?
    } else {
        serde_json::to_vec(
            &serde_json::json!({"format":"breditor/physical-room-recovery-accepted-native-request","formatVersion":1,"selection":setup.selection(),"document":"include","review":{"kind":"start"}}),
        )?
    };
    let response = server.request(&request, &input).await?;
    assert!(guard.mutated.load(Ordering::SeqCst));
    assert!(
        [400, 503].contains(&response.status),
        "A changed final selected source cannot return accepted native data"
    );
    assert_ne!(fs::read(&path)?, before);
    fs::write(&path, &before)?;
    server.stop().await?;
    Ok(())
}
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn last_provider_callback_changing_native_source_refuses_payload() -> TestResult {
    last_callback(false, false).await
}
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn last_provider_callback_changing_raster_source_refuses_payload() -> TestResult {
    last_callback(true, false).await
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn last_provider_callback_changing_native_source_refuses_original_rights() -> TestResult {
    last_callback(false, true).await
}
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn last_provider_callback_changing_raster_source_refuses_original_rights() -> TestResult {
    last_callback(true, true).await
}

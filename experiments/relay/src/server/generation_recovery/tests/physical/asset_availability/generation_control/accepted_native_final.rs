//! The last actual provider callback must not publish native payloads after
//! changing a selected native/raster source. Test-owned bytes are restored only
//! after the refused request so fixture cleanup can complete normally.
use super::super::super::super::source::TestResult;
use super::{
    fixture::{Setup, operators},
    network::{Network, Request},
};
use crate::server::{
    ServerLogGenerationRecoveryAssetCoverage, ServerRecoveryAssetProvider,
    prepare_log_generation_recovery_control,
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
#[derive(Clone, Copy)]
enum ReadKind {
    AcceptedNative,
    OriginalReview,
    Metadata,
    MetadataPacket,
    NativeDependencies,
}
impl ReadKind {
    fn path(self) -> &'static str {
        match self {
            Self::NativeDependencies => "/recovery/generations/v1/native-dependencies/read",
            Self::MetadataPacket => "/recovery/generations/v1/metadata/packet/read",
            Self::Metadata => "/recovery/generations/v1/metadata/read",
            Self::OriginalReview => "/recovery/generations/v1/review/authorizations/read",
            Self::AcceptedNative => "/recovery/generations/v1/accepted/read",
        }
    }
    async fn body(self, setup: &Setup) -> TestResult<Vec<u8>> {
        let input = match self {
            Self::NativeDependencies => {
                serde_json::json!({"format":"breditor/server-log-generation-recovery-native-dependencies-request","formatVersion":1,"selection":setup.selection()})
            }
            Self::MetadataPacket => super::metadata_packets::version_body(setup).await?,
            Self::Metadata => {
                serde_json::json!({"format":"breditor/server-log-generation-recovery-metadata-request","formatVersion":1,"selection":setup.selection(),"metadata":{"versions":{"kind":"disabled"},"suggestions":{"kind":"disabled"},"revisions":{"kind":"disabled"}}})
            }
            Self::OriginalReview => super::original_review::body(setup).await?,
            Self::AcceptedNative => {
                serde_json::json!({"format":"breditor/server-log-generation-recovery-accepted-native-request","formatVersion":1,"selection":setup.selection(),"document":"include","review":{"kind":"start"}})
            }
        };
        Ok(serde_json::to_vec(&input)?)
    }
}
async fn last_callback(raster: bool, kind: ReadKind) -> TestResult {
    let mut setup = if matches!(kind, ReadKind::MetadataPacket) {
        Box::pin(super::metadata_receipts::seeded((3, true), true, 1)).await?
    } else {
        Box::pin(Setup::new((3, true), true)).await?
    };
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
    let ServerLogGenerationRecoveryAssetCoverage::Verified(proof) = setup
        .fixture
        .local()
        .verify_recovery_asset_availability(
            "owner",
            &setup.fixture.owner,
            setup.native.clone(),
            provider.clone(),
        )
        .await?
    else {
        return Err("genuine native provider proof".into());
    };
    setup.proof = Arc::new(proof);
    let (router, control) = prepare_log_generation_recovery_control(
        setup.fixture.local().clone(),
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
    let input = kind.body(&setup).await?;
    guard.calls.store(0, Ordering::SeqCst);
    setup
        .proof
        .check_live(setup.fixture.local(), "owner", &setup.fixture.owner, setup.provider.clone())
        .await?;
    let one = guard.calls.swap(0, Ordering::SeqCst);
    assert!(one > 0);
    guard.mutate_at.store(one * 2, Ordering::SeqCst);
    let server = Network::start(setup.router.clone()).await?;
    let request = Request { path: kind.path(), ..Request::check(&setup.token) };
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
    last_callback(false, ReadKind::AcceptedNative).await
}
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn last_provider_callback_changing_raster_source_refuses_payload() -> TestResult {
    last_callback(true, ReadKind::AcceptedNative).await
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn last_provider_callback_changing_native_source_refuses_original_rights() -> TestResult {
    last_callback(false, ReadKind::OriginalReview).await
}
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn last_provider_callback_changing_raster_source_refuses_original_rights() -> TestResult {
    last_callback(true, ReadKind::OriginalReview).await
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn last_provider_callback_changing_native_source_refuses_metadata_receipts() -> TestResult {
    last_callback(false, ReadKind::Metadata).await
}
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn last_provider_callback_changing_raster_source_refuses_metadata_receipts() -> TestResult {
    last_callback(true, ReadKind::Metadata).await
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn metadata_packet_last_provider_callback_changing_native_source_refuses() -> TestResult {
    last_callback(false, ReadKind::MetadataPacket).await
}
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn metadata_packet_last_provider_callback_changing_raster_source_refuses() -> TestResult {
    last_callback(true, ReadKind::MetadataPacket).await
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn native_dependencies_final_callback_changing_native_source_refuses() -> TestResult {
    last_callback(false, ReadKind::NativeDependencies).await
}
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn native_dependencies_final_callback_changing_raster_source_refuses() -> TestResult {
    last_callback(true, ReadKind::NativeDependencies).await
}

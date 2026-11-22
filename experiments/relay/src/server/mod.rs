//! Loopback reference WebSocket host. All native transactions and blocking fsync run off the
//! async I/O workers, inside the same serialized room authority. Public untrusted hosting still
//! requires the planned resource-limited import worker, TLS and deployment qualification.
mod assets;
mod continued_assets;
pub use crate::room::{
    ContinuedRasterRoomBackupFiles, ContinuedRasterRoomClientArchives,
    RecoveredContinuedRasterRoom, RecoveredContinuedRasterRoomIdentity,
};
pub use continued_assets::{
    ContinuedAssetServerHandle, ContinuedRasterActivation, ContinuedRasterActivationApproval,
    ContinuedRasterNativeTailInspection, ContinuedRasterNativeTailOutcome,
    ContinuedRasterNativeTailPlan, ContinuedRasterNativeTailRepair, ContinuedRasterRestart,
    ContinuedRasterRoomBackupIdentity, ContinuedRasterRoomInputReport,
    ContinuedRasterRotationInspection, ContinuedRasterRotationPlan, ContinuedRasterRotationRepair,
    ContinuedRasterRotationRepairOutcome, ContinuedRasterSeal, ContinuedRasterSealing,
    ContinuedRasterUploadInspection, ContinuedRasterUploadPlan, ContinuedRasterUploadRepair,
    ContinuedRasterUploadRepairOutcome, SealedContinuedRasterActivation,
    router_with_continued_assets_and_deployment_lease,
};
mod authentication;
mod backup;
mod connection;
mod deployment_fence;
mod documents;
mod generation_backup;
mod generation_recovery;
mod http;
mod publication_connections;
mod recovered_discussions;
mod segment_handover;
mod versions;
mod wire;
pub use crate::log::generations::PendingNativeLogRotation;
use crate::{Error, Result, Room};
pub use authentication::Authentication;
use axum::{
    Router,
    extract::{State, WebSocketUpgrade},
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    routing::get,
};
pub use backup::{
    ContentAddressedServerAssets, MAX_SERVER_ASSET_AVAILABILITY_BYTES, SealedServerHandover,
    ServerAssetAvailabilityCoverage, ServerAssetAvailabilityMissing, ServerAssetAvailabilityRead,
    ServerAssetRecoveryState, ServerAssetResolution, ServerBackupHandle,
    ServerRecoveryAssetCoverage, ServerRecoveryAssetProvider, ServerRecoveryContinuationCoverage,
    ServerRecoveryContinuationIdentity, ServerRecoveryCoverage, ServerRecoveryState,
    ServerRecoveryStateIdentity, VerifiedServerAssetAvailability, VerifiedServerRecoveryAssets,
    VerifiedServerRecoveryContinuation, VerifiedServerRecoveryState, router_with_server_backups,
    router_with_server_backups_and_deployment_lease,
};
pub use deployment_fence::{
    RoomDeploymentAuthority, RoomDeploymentIdentity, RoomDeploymentLease, RoomDeploymentSelection,
    router_with_assets_and_deployment_lease, router_with_deployment_lease,
};
pub use documents::{
    DocumentServer, DocumentServerConfiguration, WEBHOOK_SIGNATURE_HEADER, sign_webhook,
    verify_webhook_signature,
};
pub use generation_backup::{
    LogGenerationHandoverStatus, LogGenerationServerBackupHandle, PreparedLogGenerationHandover,
    PreparedLogGenerationHandoverIdentity, SealedLogGenerationHandover,
    router_with_log_generation_backups_and_deployment_lease,
};
pub use generation_recovery::{
    ActivatedNativeLogGenerationHost, DurableNativeActivationControl,
    DurableNativeActivationControlIdentity, MAX_DELIVERY_PATH_ANCESTORS,
    MAX_DELIVERY_PATH_ARCHIVE_BYTES, NativeGenerationActivationCheckpointStatus,
    NativeGenerationActivationPrepareOptions, NativeLogGenerationActivationIdentity,
    NativeRoomPublication, NativeRoomPublicationBinding, NativeRoomPublicationIdentity,
    NativeRoomPublicationReceipt, NativeRoomPublicationRequest, PhysicalRoomRecoveryControl,
    PhysicalRoomRecoveryControlIdentity, PhysicalServerAssetAvailabilityRead,
    PhysicalServerAssetRecoveryState, PhysicalServerRecoveryAssetCoverage,
    PhysicalServerRoomRecoveryCoverage, PhysicalServerRoomRecoveryState,
    PhysicalServerRoomRecoveryStateIdentity, PreparedLogGenerationRecoveryHost,
    PreparedNativeGenerationActivation, PreparedNativeGenerationActivationIdentity,
    PreparedPhysicalRoomRecoveryHost, ReopenedSealedNativeRestartHost,
    SealedNativeRasterUploadInspection, SealedNativeRasterUploadRecoveryFiles,
    SealedNativeRestartBootstrap, SealedNativeRestartBootstrapCoverage,
    SealedNativeRestartHostCoverage, SealedNativeRestartSelection,
    SealedNativeRotationAndRasterCompletionFiles, SealedNativeRotationAndRasterInspection,
    SealedNativeRotationCompletionFiles, SealedNativeRotationInspection,
    SealedNativeTailAndRasterInspection, SealedNativeTailAndRasterRepairFiles,
    SealedNativeTailInspection, SealedNativeTailRepairFiles, SealedNativeTailRepairOutcome,
    ServerLogGenerationAssetAvailabilityRead, ServerLogGenerationAssetRecoveryState,
    ServerLogGenerationDeliveryContinuationIdentity, ServerLogGenerationDeliveryPathIdentity,
    ServerLogGenerationDeliveryPathRecoveryControl,
    ServerLogGenerationDeliveryPathRecoveryControlIdentity,
    ServerLogGenerationDeliveryRecoveryControl, ServerLogGenerationDeliveryRecoveryControlIdentity,
    ServerLogGenerationHandoverDeliveryPathIdentity,
    ServerLogGenerationHandoverDeliveryPathOptions,
    ServerLogGenerationHandoverDeliveryPathRecoveryControlIdentity,
    ServerLogGenerationRecoveryAssetCoverage, ServerLogGenerationRecoveryControl,
    ServerLogGenerationRecoveryControlIdentity, ServerLogGenerationRecoveryCoverage,
    ServerLogGenerationRecoveryState, ServerLogGenerationRecoveryStateIdentity,
    VerifiedPhysicalServerRecoveryAssets, VerifiedPhysicalServerRoomRecoveryState,
    VerifiedServerLogGenerationDeliveryContinuation, VerifiedServerLogGenerationDeliveryPath,
    VerifiedServerLogGenerationHandoverDeliveryPath, VerifiedServerLogGenerationRecoveryAssets,
    VerifiedServerLogGenerationRecoveryState, complete_sealed_native_rotation,
    complete_sealed_native_rotation_and_raster, inspect_sealed_native_raster_upload,
    inspect_sealed_native_restart, inspect_sealed_native_restart_to,
    inspect_sealed_native_rotation, inspect_sealed_native_rotation_and_raster,
    inspect_sealed_native_tail, inspect_sealed_native_tail_and_raster,
    open_sealed_native_restart_host, prepare_durable_native_activation_control,
    prepare_log_generation_delivery_path_recovery_control,
    prepare_log_generation_delivery_recovery_control,
    prepare_log_generation_handover_delivery_path_recovery_control,
    prepare_log_generation_recovery_control, prepare_log_generation_recovery_host,
    prepare_log_generation_recovery_host_file, prepare_native_room_publication,
    prepare_physical_room_recovery_control, prepare_physical_room_recovery_host,
    reconstruct_log_generation_recovery_host, reopen_sealed_native_restart_host,
    repair_sealed_native_tail, repair_sealed_native_tail_and_raster,
    retire_sealed_native_raster_upload,
};
pub(crate) use segment_handover::router_with_recovered_segment;
pub use segment_handover::{
    RelaySegmentDiscussionBackup, RelaySegmentDiscussionBackupIdentity,
    RelaySegmentHandoverApproval, RelaySegmentHandoverInputCoverage,
    RelaySegmentHandoverInputReport, RelaySegmentParticipantBranchInspection,
    RelaySegmentPortableBackupIdentity, RelaySegmentPortableSeal, RelaySegmentRetainedBackup,
    RelaySegmentRetainedBackupIdentity, RelaySegmentRetiredHistorySelection,
    SealedRelaySegmentActivation, VerifiedRelaySegmentHandoverInputs,
};
use std::sync::{Arc, Mutex};
use tokio::sync::{Semaphore, watch};

#[derive(Clone)]
pub(super) struct Host {
    room: Arc<Mutex<Room>>,
    authentication: Arc<Authentication>,
    changed: watch::Sender<u64>,
    connections: Arc<Semaphore>,
    assets: Option<Arc<Mutex<crate::assets::AssetStore>>>,
    continued_assets: Option<Arc<Mutex<crate::ContinuedAssetStore>>>,
    continued_custody: Option<Arc<crate::room::ContinuedServingCustody>>,
    assets_changed: watch::Sender<u64>,
    asset_operations: Arc<Semaphore>,
    presence_changed: watch::Sender<u64>,
    review_changed: watch::Sender<u64>,
    versions_changed: watch::Sender<u64>,
    version_operations: Arc<Semaphore>,
    discussion_operations: Arc<Semaphore>,
    discussion_publications: Arc<Semaphore>,
    suggestions_changed: watch::Sender<u64>,
    generation_custody: Option<Arc<crate::room::GenerationOperationCustody>>,
    generation_serving:
        Arc<std::sync::OnceLock<generation_recovery::NativeGenerationServingCustody>>,
    publication_connections: Option<Arc<publication_connections::Connections>>,
    deployment: deployment_fence::HostDeployment,
    relay_segment_custody: Option<Arc<crate::room::RelaySegmentServingCustody>>,
}
impl Host {
    pub async fn transaction<T: Send + 'static>(
        &self,
        f: impl FnOnce(&mut Room) -> Result<T> + Send + 'static,
    ) -> Result<T> {
        let room = self.room.clone();
        let custody = self.generation_custody.clone();
        let assets = self.assets.clone();
        let continued = self.continued_assets.clone();
        let continued_custody = self.continued_custody.clone();
        let deployment = self.deployment.clone();
        let serving = self.generation_serving.clone();
        let segment = self.relay_segment_custody.clone();
        tokio::task::spawn_blocking(move || {
            deployment.transaction(|| {
                let _custody = custody;
                if let Some(held) = serving.get() {
                    held.check_retained()?;
                }
                if let Some(held) = &segment {
                    held.check()?;
                }
                let _assets = assets;
                let mut room = room.lock().map_err(|_| Error::NeedsRecovery)?;
                if let Some(assets) = &continued {
                    assets.lock().map_err(|_| Error::NeedsRecovery)?.guard()?;
                }
                if let Some(held) = &continued_custody {
                    held.check(&room)?;
                }
                let result = f(&mut room);
                if let Some(held) = &continued_custody {
                    held.check(&room)?;
                }
                if let Some(assets) = &continued {
                    assets.lock().map_err(|_| Error::NeedsRecovery)?.guard()?;
                }
                if let Some(held) = serving.get() {
                    held.check_retained()?;
                }
                if let Some(held) = &segment {
                    held.check()?;
                }
                result
            })
        })
        .await
        .map_err(|_| Error::NeedsRecovery)?
    }
    pub fn notify(&self) {
        self.changed.send_modify(|n| *n = n.wrapping_add(1));
        self.notify_presence();
    }
    pub fn notify_presence(&self) {
        self.presence_changed.send_modify(|n| *n = n.wrapping_add(1));
    }
    pub fn notify_review(&self) {
        self.review_changed.send_modify(|n| *n = n.wrapping_add(1));
    }
    pub fn notify_document_versions(&self) {
        self.versions_changed.send_modify(|n| *n = n.wrapping_add(1));
    }
    pub fn notify_document_suggestions(&self) {
        self.suggestions_changed.send_modify(|n| *n = n.wrapping_add(1));
    }
}

/// Build an authenticated, exact-Origin, bounded reference room router.
/// `/health` reveals only the live service version; `/ws` requires a first-message account handshake.
/// The server holds at most 64 live upgrades and coalesces catchup notifications without keeping
/// an unbounded per-peer frame queue. A newly authorized reader receives the latest full state.
pub fn router(room: Room, authentication: Authentication) -> Router {
    build(room, authentication, None)
}
/// Attach an explicitly opened durable asset store to the room. HTTP reads/writes authenticate
/// the same accounts and recheck current room roles; a digest URL never grants access by itself.
/// # Errors
/// Rejects a store bound to another immutable room seed/authority.
pub fn router_with_assets(
    room: Room,
    authentication: Authentication,
    assets: crate::assets::AssetStore,
) -> Result<Router> {
    if room.asset_binding() != assets.binding() {
        return Err(Error::Contract("asset store room binding"));
    }
    Ok(build(room, authentication, Some(assets)))
}
fn build(
    room: Room,
    authentication: Authentication,
    assets: Option<crate::assets::AssetStore>,
) -> Router {
    routes(create_host(room, authentication, assets))
}
fn create_host(
    room: Room,
    authentication: Authentication,
    assets: Option<crate::assets::AssetStore>,
) -> Host {
    create_shared_host(room, Arc::new(authentication), assets)
}
fn create_shared_host(
    room: Room,
    authentication: Arc<Authentication>,
    assets: Option<crate::assets::AssetStore>,
) -> Host {
    let (changed, _) = watch::channel(0);
    let (assets_changed, _) = watch::channel(0);
    let (presence_changed, _) = watch::channel(0);
    let (review_changed, _) = watch::channel(0);
    let (versions_changed, _) = watch::channel(0);
    let (suggestions_changed, _) = watch::channel(0);
    Host {
        room: Arc::new(Mutex::new(room)),
        authentication,
        changed,
        connections: Arc::new(Semaphore::new(64)),
        assets: assets.map(|store| Arc::new(Mutex::new(store))),
        continued_assets: None,
        continued_custody: None,
        assets_changed,
        asset_operations: Arc::new(Semaphore::new(4)),
        presence_changed,
        review_changed,
        versions_changed,
        version_operations: Arc::new(Semaphore::new(4)),
        discussion_operations: Arc::new(Semaphore::new(2)),
        discussion_publications: Arc::new(Semaphore::new(2)),
        suggestions_changed,
        generation_custody: None,
        generation_serving: Arc::new(std::sync::OnceLock::new()),
        publication_connections: None,
        deployment: deployment_fence::HostDeployment::unfenced(),
        relay_segment_custody: None,
    }
}
fn routes(host: Host) -> Router {
    Router::new()
        .route("/health", get(|| async { "breditor-relay-v1" }))
        .route("/ws", get(upgrade))
        .route(
            "/document-versions/v1/descriptor",
            get(versions::describe).options(versions::preflight),
        )
        .route(
            "/document-versions/v1/catalog",
            axum::routing::post(versions::list).options(versions::preflight),
        )
        .route(
            "/document-versions/v1/publish",
            axum::routing::post(versions::publish).options(versions::preflight),
        )
        .route(
            "/document-versions/v1/packets/{id}",
            get(versions::download).options(versions::preflight),
        )
        .route(
            "/recovered-discussions/v1/threads/{actor}/{counter}",
            get(recovered_discussions::discover)
                .post(recovered_discussions::publish)
                .options(recovered_discussions::preflight),
        )
        .route(
            "/recovered-discussions/v1/threads/{actor}/{counter}/file",
            get(recovered_discussions::download).options(recovered_discussions::preflight),
        )
        .route(
            "/assets/{asset}",
            get(assets::download).put(assets::upload).options(assets::preflight),
        )
        .with_state(host)
}
async fn upgrade(State(host): State<Host>, headers: HeaderMap, ws: WebSocketUpgrade) -> Response {
    if !headers
        .get("origin")
        .and_then(|h| h.to_str().ok())
        .is_some_and(|o| host.authentication.origin(o))
    {
        return StatusCode::FORBIDDEN.into_response();
    }
    let Ok(permit) = host.connections.clone().try_acquire_owned() else {
        return StatusCode::SERVICE_UNAVAILABLE.into_response();
    };
    let connection = match &host.publication_connections {
        Some(owner) => match owner.enter() {
            Ok(connection) => Some(connection),
            Err(_) => return StatusCode::SERVICE_UNAVAILABLE.into_response(),
        },
        None => None,
    };
    ws.max_message_size(wire::MAX_MESSAGE)
        .max_frame_size(wire::MAX_MESSAGE)
        .write_buffer_size(64 * 1024)
        .max_write_buffer_size(wire::MAX_MESSAGE + 64 * 1024)
        .on_upgrade(move |socket| async move {
            let mut actual_connection = connection;
            if let Some(actual) = &mut actual_connection {
                actual.start();
            }
            let cleanup = connection::run(host, socket, permit).await;
            if cleanup.is_ok()
                && let Some(actual) = &mut actual_connection
            {
                actual.finish();
            }
        })
}

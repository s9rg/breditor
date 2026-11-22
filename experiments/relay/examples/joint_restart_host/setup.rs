//! Genuine source seal and durable target activation before exposing client routes.
use super::{Result, activate, authentication, credentials, source};
use breditor_collab_relay::server::{
    ActivatedNativeLogGenerationHost, PreparedNativeGenerationActivation, RoomDeploymentAuthority,
    prepare_log_generation_recovery_host, router_with_log_generation_backups_and_deployment_lease,
};
use breditor_collab_relay::{
    RecoveryRegistrationCredentials, Role, RoomRecoveryPolicy, ServerLogGenerationRoomBackup,
    ServerLogGenerationRoomRecovery,
};
use serde_json::Value;
use std::{
    path::{Path, PathBuf},
    sync::Arc,
};

pub(super) struct Ready {
    pub root: PathBuf,
    pub spec: source::Spec,
    pub configuration: String,
    pub records: Value,
    pub protected: RecoveryRegistrationCredentials,
    pub secrets: Vec<String>,
    pub original: ServerLogGenerationRoomBackup,
    pub older: ServerLogGenerationRoomBackup,
    pub active: ActivatedNativeLogGenerationHost,
    pub checkpoint: Arc<PreparedNativeGenerationActivation>,
    pub old_router: axum::Router,
    pub owner_token: String,
    pub alice_token: String,
    pub old_alice_token: String,
    pub initial_snapshot: std::sync::OnceLock<Arc<ServerLogGenerationRoomBackup>>,
}
pub(super) async fn prepare(
    parent: &Path,
    spec: source::Spec,
    rasters: &[Vec<u8>],
) -> Result<Ready> {
    Box::pin(prepare_selected(parent, spec, rasters, false)).await
}
/// Separate functional fixture policy. The original fixture keeps its exact
/// absent suggestion grant; no saved permission is inferred or bypassed.
pub(super) async fn prepare_with_suggestion_grants(
    parent: &Path,
    spec: source::Spec,
    rasters: &[Vec<u8>],
) -> Result<Ready> {
    Box::pin(prepare_selected(parent, spec, rasters, true)).await
}
async fn prepare_selected(
    parent: &Path,
    spec: source::Spec,
    rasters: &[Vec<u8>],
    suggestions: bool,
) -> Result<Ready> {
    let super::seed::Seeded {
        root,
        configuration,
        records,
        protected,
        secrets,
        room,
        assets,
        older,
    } = super::seed::prepare(parent, spec, rasters, suggestions)?;
    let authority =
        RoomDeploymentAuthority::create(&root.join("authority"), &room.deployment_binding()?)?;
    let lease = authority.claim(&authority.current_selection()?)?;
    let old = authentication::accounts()?;
    let (old_router, live) = router_with_log_generation_backups_and_deployment_lease(
        room,
        old.authentication,
        assets,
        lease,
        "owner",
        &old.owner,
    )
    .await?;
    let original = live.capture("owner", &old.owner).await?;
    let intent = live
        .prepare_handover(
            "owner",
            &old.owner,
            &root.join("source-intent"),
            original.info()?.identity,
        )
        .await?;
    let selection = intent.identity().clone();
    let intent =
        Arc::new(live.seal_prepared_handover("owner", &old.owner, intent, &selection).await?);
    // The old router retains the REAL sealed owner, never a reopened substitute.
    drop(live);
    let mut operation = ServerLogGenerationRoomRecovery::begin(
        &root.join("target"),
        &original,
        &original.info()?.identity,
        RoomRecoveryPolicy::HostReacquired,
    )?
    .finish(&original)?
    .begin_operation(
        &original,
        &original.info()?.identity,
        RoomRecoveryPolicy::HostReacquired,
        "owner",
    )?;
    operation.room_mut().grant("owner", "post-origin-reader", Some(Role::Reader))?;
    operation.room_mut().rotate_log_generation("owner", "post-origin-physical-cut")?;
    let target = authentication::accounts()?;
    let host = Box::pin(prepare_log_generation_recovery_host(
        operation,
        target.authentication,
        ServerLogGenerationRoomBackup::from_owned_bytes(original.to_bytes()?)?,
        &original.info()?.identity,
        "owner",
        &target.owner,
    ))
    .await?;
    let proof = credentials::verify(&host, &target.owner, &protected).await?;
    let (active, checkpoint) =
        activate::activate(&root, &host, &target.owner, intent, authority, proof).await?;
    Ok(Ready {
        root,
        spec,
        configuration,
        records,
        protected,
        secrets,
        original,
        older,
        active,
        checkpoint,
        old_router,
        owner_token: target.owner,
        alice_token: target.alice,
        old_alice_token: old.alice,
        initial_snapshot: std::sync::OnceLock::new(),
    })
}

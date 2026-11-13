//! Prepare a real successor under a sealed predecessor, with no serving routes.
use super::{
    Result,
    capture::{authentication, authentication_for_digest},
};
use breditor_collab_relay::{
    Room, ServerLogGenerationRoomBackup,
    assets::AssetStore,
    server::{
        DurableNativeActivationControl, NativeGenerationActivationPrepareOptions,
        NativeRoomPublication, PreparedLogGenerationHandover, PreparedLogGenerationRecoveryHost,
        RoomDeploymentAuthority, RoomDeploymentLease, VerifiedServerLogGenerationRecoveryState,
        prepare_durable_native_activation_control, prepare_native_room_publication,
        router_with_log_generation_backups_and_deployment_lease,
    },
};
use std::{path::Path, sync::Arc};

pub struct Predecessor {
    intent: Arc<PreparedLogGenerationHandover>,
    authority: RoomDeploymentAuthority,
    lease: RoomDeploymentLease,
}

pub struct Prepared {
    pub control: Arc<DurableNativeActivationControl>,
    pub publication: NativeRoomPublication,
    pub router: axum::Router,
    pub predecessor: RoomDeploymentLease,
}

pub async fn seal(
    root: &Path,
    room: Room,
    assets: AssetStore,
) -> Result<(ServerLogGenerationRoomBackup, Predecessor)> {
    let authority =
        RoomDeploymentAuthority::create(&root.join("deployment"), &room.deployment_binding()?)?;
    let lease = authority.claim(&authority.current_selection()?)?;
    let (auth, token) = authentication("owner")?;
    let (_router, live) = router_with_log_generation_backups_and_deployment_lease(
        room,
        auth,
        assets,
        lease.clone(),
        "owner",
        &token,
    )
    .await?;
    let backup = live.capture("owner", &token).await?;
    let intent = live
        .prepare_handover("owner", &token, &root.join("source-intent"), backup.info()?.identity)
        .await?;
    let selected = intent.identity().clone();
    let intent = Arc::new(live.seal_prepared_handover("owner", &token, intent, &selected).await?);
    if lease.check().is_ok() {
        return Err("the sealed predecessor retained its serving lease".into());
    }
    Ok((backup, Predecessor { intent, authority, lease }))
}

pub async fn prepare(
    root: &Path,
    predecessor: Predecessor,
    host: PreparedLogGenerationRecoveryHost,
    proof: Arc<VerifiedServerLogGenerationRecoveryState>,
    native_token: &str,
    operator_digest: &[u8; 32],
) -> Result<Prepared> {
    let checkpoint = Arc::new(
        host.prepare_durable_native_activation(
            "owner",
            native_token,
            predecessor.intent,
            &proof,
            NativeGenerationActivationPrepareOptions {
                root: root.join("activation"),
                authority: predecessor.authority.clone(),
            },
        )
        .await?,
    );
    let operators = authentication_for_digest("operator", operator_digest)?;
    let (router, control) = prepare_durable_native_activation_control(
        host,
        proof,
        checkpoint,
        predecessor.authority,
        "owner",
        native_token,
        operators,
    )
    .await?;
    if control.service_router().await.is_ok() {
        return Err("activation fixture must stay prepared".into());
    }
    let control = Arc::new(control);
    let listener = std::net::TcpListener::bind("127.0.0.1:0")?;
    let (publication_router, publication) =
        prepare_native_room_publication(control.clone(), listener)?;
    if publication.observe().await.is_ok() {
        return Err("prepared listener started serving prematurely".into());
    }
    Ok(Prepared {
        control,
        publication,
        router: router.merge(publication_router),
        predecessor: predecessor.lease,
    })
}

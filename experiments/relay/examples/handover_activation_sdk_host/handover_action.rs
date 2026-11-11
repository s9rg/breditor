//! Seal the actual predecessor, restore a genuine successor and retain an
//! inactive checkpoint. Only its authenticated HTTP control may activate it.
use super::{
    Result, authentication, credentials, native_service::NativeService, protocol, service,
    snapshot::HandoverPrefix, state::Offer, state::State, storage,
};
use breditor_collab_relay::{
    RoomRecoveryPolicy, ServerLogGenerationRoomBackup, ServerLogGenerationRoomRecovery,
    server::{
        NativeGenerationActivationPrepareOptions, PreparedLogGenerationHandover,
        RoomDeploymentAuthority, prepare_durable_native_activation_control,
        prepare_log_generation_recovery_host,
    },
};
use std::sync::Arc;

pub(super) async fn apply(state: &mut State, request: u64) -> Result<bool> {
    if !state.serving || state.handover.is_some() {
        protocol::refuse(request, "select-one-initial-active-source-handover")?;
        return Ok(false);
    }
    state.stop_services().await?;
    let ready = state.ready.as_mut().ok_or("actual native owner missing")?;
    let active = ready.active.actual_native()?;
    let host = active.recovery_host();
    let expected =
        host.capture_recovery_state("owner", &ready.owner_token).await?.identity()?.server;
    let authority =
        RoomDeploymentAuthority::open_at_least(&ready.root.join("authority"), active.selection())?;
    let root = ready.root.join("sdk-handover");
    storage::directory(&root)?;
    let intent = Arc::new(
        active
            .prepare_next_handover(
                "owner",
                &ready.owner_token,
                &root.join("intent"),
                expected.clone(),
            )
            .await?,
    );
    let selected = intent.identity().clone();
    storage::write_new(&root.join("source-choice.json"), &serde_json::to_vec(&selected)?)?;
    active.seal_next_handover("owner", &ready.owner_token, &intent, &selected).await?;
    drop(intent);
    let intent = Arc::new(PreparedLogGenerationHandover::open(&root.join("intent"), &selected)?);
    let archive = intent.source_backup();
    let policy = RoomRecoveryPolicy::HostReacquired;
    let operation =
        ServerLogGenerationRoomRecovery::begin(&root.join("target"), archive, &expected, policy)?
            .finish(archive)?
            .begin_operation(archive, &expected, policy, "owner")?;
    let accounts = authentication::accounts()?;
    let successor = prepare_log_generation_recovery_host(
        operation,
        accounts.authentication,
        ServerLogGenerationRoomBackup::from_owned_bytes(archive.to_bytes()?)?,
        &expected,
        "owner",
        &accounts.owner,
    )
    .await?;
    let proof = Arc::new(credentials::verify(&successor, &accounts.owner, &ready.protected).await?);
    let checkpoint = Arc::new(
        successor
            .prepare_durable_native_activation(
                "owner",
                &accounts.owner,
                intent.clone(),
                &proof,
                NativeGenerationActivationPrepareOptions {
                    root: root.join("native-checkpoint"),
                    authority: authority.clone(),
                },
            )
            .await?,
    );
    storage::write_new(
        &root.join("activation-choice.json"),
        &serde_json::to_vec(checkpoint.identity())?,
    )?;
    let (operators, token) = authentication::operator()?;
    let (router, control) = prepare_durable_native_activation_control(
        successor.clone(),
        proof,
        checkpoint.clone(),
        authority.clone(),
        "owner",
        &accounts.owner,
        operators,
    )
    .await?;
    // A genuine prepared control has no service router before its HTTP commit.
    if control.service_router().await.is_ok() {
        return Err("prepared handover unexpectedly serves Native clients".into());
    }
    let selection = serde_json::to_value(control.identity())?;
    let original = ServerLogGenerationRoomBackup::from_owned_bytes(archive.to_bytes()?)?;
    let earlier = std::iter::once(Arc::new(std::mem::replace(&mut ready.original, original)))
        .chain(state.observed.values().cloned())
        .collect();
    ready.active = NativeService::controlled(successor, control);
    ready.checkpoint = checkpoint;
    ready.secrets.push(std::mem::replace(&mut ready.owner_token, accounts.owner));
    ready.secrets.push(std::mem::replace(&mut ready.alice_token, accounts.alice));
    ready.secrets.push(token.clone());
    ready.initial_snapshot = std::sync::OnceLock::new();
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await?;
    let endpoint =
        format!("http://{}/recovery/native-activation/v1/commit", listener.local_addr()?);
    state.tasks.push(service::start(router, listener));
    state.handover = Some(HandoverPrefix { sequence: request, earlier, intent, authority });
    state.observed.clear();
    state.previous = None;
    state.sequence = request;
    state.serving = false;
    state.offer = Some(Offer { sequence: request, selection, endpoint, token });
    Ok(true)
}

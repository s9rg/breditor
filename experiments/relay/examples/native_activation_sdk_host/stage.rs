//! Retain a complete current target, drop old serving custody, then reacquire the
//! SAME operational owner and authenticate again. Only the SDK commits this epoch.
use super::{Result, authentication, credentials, setup::Ready, storage};
use breditor_collab_relay::server::{
    DurableNativeActivationControlIdentity, NativeGenerationActivationPrepareOptions,
    PreparedNativeGenerationActivation, RoomDeploymentAuthority,
    ServerLogGenerationRecoveryStateIdentity, prepare_durable_native_activation_control,
    prepare_log_generation_recovery_host,
};
use breditor_collab_relay::{
    OperationalLogGenerationServerRoom, RoomRecoveryPolicy, ServerLogGenerationRoomBackup,
};
use std::sync::Arc;

pub(super) struct Pending {
    checkpoint: Arc<PreparedNativeGenerationActivation>,
    authority: RoomDeploymentAuthority,
    request: u64,
}
pub(super) async fn prepare(
    ready: &Ready,
    request: u64,
    expected: &ServerLogGenerationRecoveryStateIdentity,
) -> Result<Pending> {
    let host = ready.active.recovery_host();
    let proof = credentials::verify(&host, &ready.owner_token, &ready.protected).await?;
    if &proof.identity() != expected {
        return Err("selected-source-stale".into());
    }
    let authority = RoomDeploymentAuthority::open_at_least(
        &ready.root.join("authority"),
        ready.checkpoint.identity().planned_selection(),
    )?;
    let checkpoint = Arc::new(
        host.prepare_durable_native_restart(
            "owner",
            &ready.owner_token,
            ready.checkpoint.clone(),
            &proof,
            NativeGenerationActivationPrepareOptions {
                root: ready.root.join(format!("native-checkpoint-restart-{request}")),
                authority: authority.clone(),
            },
        )
        .await?,
    );
    storage::write_new(
        &ready.root.join(format!("native-checkpoint-restart-{request}-choice.json")),
        &serde_json::to_vec(checkpoint.identity())?,
    )?;
    Ok(Pending { checkpoint, authority, request })
}

pub(super) struct Offer {
    pub router: axum::Router,
    pub selection: DurableNativeActivationControlIdentity,
    pub token: String,
}
pub(super) async fn finish(ready: Ready, pending: Pending) -> Result<(Ready, Offer)> {
    let Ready {
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
        owner_token: _,
        alice_token: _,
        old_alice_token,
        initial_snapshot,
    } = ready;
    let prior = checkpoint.identity().planned_selection().clone();
    // Every router/control/inspection task must have stopped before this call.
    // The new checkpoint retains the genuine original source independently.
    drop(active);
    drop(checkpoint);
    let operation = OperationalLogGenerationServerRoom::resume(
        &root.join("target"),
        &original,
        &original.info()?.identity,
        RoomRecoveryPolicy::HostReacquired,
        "owner",
    )?;
    let account = authentication::accounts()?;
    let host = Box::pin(prepare_log_generation_recovery_host(
        operation,
        account.authentication,
        ServerLogGenerationRoomBackup::from_owned_bytes(original.to_bytes()?)?,
        &original.info()?.identity,
        "owner",
        &account.owner,
    ))
    .await?;
    let proof = credentials::verify(&host, &account.owner, &protected).await?;
    if pending.checkpoint.identity().previous_selection() != &prior {
        return Err("fresh checkpoint prior epoch differs".into());
    }
    let (operators, token) = authentication::operator()?;
    let (router, control) = prepare_durable_native_activation_control(
        host.clone(),
        Arc::new(proof),
        pending.checkpoint.clone(),
        pending.authority,
        "owner",
        &account.owner,
        operators,
    )
    .await?;
    let selection = control.identity();
    let active = super::native_service::NativeService::controlled(host, control);
    let mut secrets = secrets;
    secrets.push(token.clone());
    storage::write_new(
        &root.join(format!("sdk-native-activation-{}-choice.json", pending.request)),
        &serde_json::to_vec(&selection)?,
    )?;
    Ok((
        Ready {
            root,
            spec,
            configuration,
            records,
            protected,
            secrets,
            original,
            older,
            active,
            checkpoint: pending.checkpoint,
            old_router,
            owner_token: account.owner,
            alice_token: account.alice,
            old_alice_token,
            initial_snapshot,
        },
        Offer { router, selection, token },
    ))
}

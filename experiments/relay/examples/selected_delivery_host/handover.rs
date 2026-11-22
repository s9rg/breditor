//! Test-only real seal and successor restore on the existing fixture endpoint.
use super::{
    Result, activate, authentication, credentials, setup::Ready, snapshot::HandoverPrefix, storage,
};
use breditor_collab_relay::{
    RoomRecoveryPolicy, ServerLogGenerationRoomBackup, ServerLogGenerationRoomRecovery,
    server::{
        PreparedLogGenerationHandover, RoomDeploymentAuthority,
        prepare_log_generation_recovery_host,
    },
};
use std::{collections::BTreeMap, sync::Arc};

pub(super) async fn apply(
    ready: &mut Ready,
    observed: &BTreeMap<u64, Arc<ServerLogGenerationRoomBackup>>,
    sequence: u64,
) -> Result<HandoverPrefix> {
    let host = ready.active.recovery_host();
    let expected =
        host.capture_recovery_state("owner", &ready.owner_token).await?.identity()?.server;
    let authority = RoomDeploymentAuthority::open_at_least(
        &ready.root.join("authority"),
        ready.active.selection(),
    )?;
    let root = ready.root.join("journal-handover");
    storage::directory(&root)?;
    let intent = Arc::new(
        ready
            .active
            .prepare_next_handover(
                "owner",
                &ready.owner_token,
                &root.join("intent"),
                expected.clone(),
            )
            .await?,
    );
    let choice = intent.identity().clone();
    storage::write_new(&root.join("source-choice.json"), &serde_json::to_vec(&choice)?)?;
    ready.active.seal_next_handover("owner", &ready.owner_token, &intent, &choice).await?;
    drop(intent);
    let intent = Arc::new(PreparedLogGenerationHandover::open(&root.join("intent"), &choice)?);
    let archive = intent.source_backup();
    let policy = RoomRecoveryPolicy::HostReacquired;
    let operation =
        ServerLogGenerationRoomRecovery::begin(&root.join("target"), archive, &expected, policy)?
            .finish(archive)?
            .begin_operation(archive, &expected, policy, "owner")?;
    let accounts = authentication::accounts()?;
    let successor = Box::pin(prepare_log_generation_recovery_host(
        operation,
        accounts.authentication,
        ServerLogGenerationRoomBackup::from_owned_bytes(archive.to_bytes()?)?,
        &expected,
        "owner",
        &accounts.owner,
    ))
    .await?;
    let proof = credentials::verify(&successor, &accounts.owner, &ready.protected).await?;
    let active = activate::activate(
        &root,
        &successor,
        &accounts.owner,
        intent.clone(),
        authority.clone(),
        proof,
    )
    .await?;
    let original = ServerLogGenerationRoomBackup::from_owned_bytes(archive.to_bytes()?)?;
    let earlier = std::iter::once(Arc::new(std::mem::replace(&mut ready.original, original)))
        .chain(observed.values().cloned())
        .collect();
    ready.active = active;
    ready.secrets.push(std::mem::replace(&mut ready.owner_token, accounts.owner));
    ready.secrets.push(std::mem::replace(&mut ready.alice_token, accounts.alice));
    ready.initial_snapshot = std::sync::OnceLock::new();
    Ok(HandoverPrefix { sequence, earlier, intent, authority })
}

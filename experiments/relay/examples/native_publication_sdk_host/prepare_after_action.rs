//! Provision fresh controls for one explicitly observed complete predecessor.
//! This private fixture action proves ancestry before retiring old services.
//! Neither selecting DATA nor provisioning controls commits or publishes them.
use super::{Result, credentials, prepare_publication_action, protocol, state::State};
use breditor_collab_relay::{
    ServerLogGenerationRoomBackup, server::ServerLogGenerationRecoveryStateIdentity,
};
use std::sync::Arc;

async fn check(
    state: &State,
    source: &ServerLogGenerationRecoveryStateIdentity,
    previous: &ServerLogGenerationRoomBackup,
) -> Result {
    let ready = state.ready()?;
    let host = ready.active.recovery_host();
    let native = credentials::verify(&host, &ready.owner_token, &ready.protected).await?;
    if &native.identity() != source {
        return Err("selected actual current source differs".into());
    }
    let continuation = host
        .verify_delivery_continuation(
            "owner",
            &ready.owner_token,
            ServerLogGenerationRoomBackup::from_owned_bytes(previous.to_bytes()?)?,
            &previous.info()?.identity,
            Arc::new(native),
        )
        .await?;
    continuation.check_live(&host, "owner", &ready.owner_token).await?;
    Ok(())
}

pub(super) async fn apply(
    state: &mut State,
    request: u64,
    source: &ServerLogGenerationRecoveryStateIdentity,
    previous: u64,
) -> Result<bool> {
    let Some(archive) = state.observed.get(&previous).cloned() else {
        protocol::refuse(request, "select-an-actual-observed-predecessor")?;
        return Ok(false);
    };
    if check(state, source, &archive).await.is_err() {
        protocol::refuse(request, "selected-predecessor-or-source-stale")?;
        return Ok(false);
    }
    if !prepare_publication_action::apply(state, request, source).await? {
        return Ok(false);
    }
    // State::publish creates new authenticated controls after the old tasks
    // close, and re-verifies this exact complete predecessor natively.
    state.previous = Some((previous, archive));
    Ok(true)
}

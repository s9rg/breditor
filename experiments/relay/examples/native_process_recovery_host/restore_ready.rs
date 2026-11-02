//! Original public fixture data describes the cut; genuine native owners remain separate.
use super::{
    Result, bootstrap::Bootstrap, native_service::NativeService, observed::Observed,
    reacquire::Reacquired, setup::Ready, source,
};
use breditor_collab_relay::{
    ServerLogGenerationRoomBackup,
    server::{
        DurableNativeActivationControlIdentity, NativeGenerationActivationCheckpointStatus,
        PreparedNativeGenerationActivationIdentity,
    },
};
use std::sync::OnceLock;
pub(super) struct Restored {
    pub input: Bootstrap,
    pub ready: Ready,
    pub router: axum::Router,
    pub token: String,
    pub selection: DurableNativeActivationControlIdentity,
    pub identity: PreparedNativeGenerationActivationIdentity,
    pub status: NativeGenerationActivationCheckpointStatus,
}
pub(super) fn apply(reacquired: Reacquired, observed: &Observed) -> Result<Restored> {
    let Reacquired {
        input,
        identity,
        status,
        original,
        checkpoint,
        host,
        control,
        router,
        token,
        protected,
        owner,
        alice,
    } = reacquired;
    let selected = input.root.join("snapshots").join(format!("cut-{}", input.initial_sequence));
    let fixture: serde_json::Value =
        serde_json::from_slice(&std::fs::read(selected.join("fixture.json"))?)?;
    if fixture["format"] != "breditor/native-selected-delivery-fixture"
        || fixture["formatVersion"] != 1
    {
        return Err("actual original fixture data required".into());
    }
    let spec = source::Spec {
        language: fixture["language"].as_u64().ok_or("language")?.try_into()?,
        standard: fixture["standard"].as_bool().ok_or("standard")?,
        atomic: fixture["atomic"].as_bool().ok_or("atomic")?,
    };
    let configuration = fixture["configuration"].as_str().ok_or("configuration")?.to_owned();
    let records = fixture["clients"].clone();
    let initial_snapshot = OnceLock::new();
    initial_snapshot
        .set(observed.get(&input.initial_sequence).ok_or("initial source")?.clone())
        .map_err(|_| "initial source")?;
    let older = ServerLogGenerationRoomBackup::from_owned_bytes(std::fs::read(
        selected.join("older-server.backup"),
    )?)?;
    let secrets = protected
        .documents
        .iter()
        .map(|row| row.credential.clone())
        .chain(protected.reviews.iter().map(|row| row.credential.clone()))
        .chain([token.clone(), input.old_alice_token.clone()])
        .collect();
    let selection = control.identity();
    let old_router = axum::Router::new().fallback(|| async { axum::http::StatusCode::GONE });
    let ready = Ready {
        root: input.root.clone(),
        spec,
        configuration,
        records,
        protected,
        secrets,
        original,
        older,
        active: NativeService::controlled(host, control),
        checkpoint,
        old_router,
        owner_token: owner,
        alice_token: alice,
        old_alice_token: input.old_alice_token.clone(),
        initial_snapshot,
    };
    Ok(Restored { input, ready, router, token, selection, identity, status })
}

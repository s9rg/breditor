//! Provision the actual socket/control; private IPC cannot publish normal routes.
use super::{Result, prepare_action, protocol, service, state::State};
use breditor_collab_relay::server::{
    NativeRoomPublicationIdentity, ServerLogGenerationRecoveryStateIdentity,
    prepare_native_room_publication,
};
pub(super) struct Offer {
    pub selection: NativeRoomPublicationIdentity,
    pub endpoint: String,
}
pub(super) async fn apply(
    state: &mut State,
    request: u64,
    source: &ServerLogGenerationRecoveryStateIdentity,
) -> Result<bool> {
    if !prepare_action::apply(state, request, source).await? {
        return Ok(false);
    }
    provision(state, request).await
}
/// Bind publication to the actual already-provisioned activation owner. A
/// process reopen uses this after fresh custody/authentication, without preparing
/// another checkpoint or committing through private IPC.
pub(super) async fn provision(state: &mut State, request: u64) -> Result<bool> {
    let actual = state.ready()?.active.actual_control()?;
    let normal = tokio::net::TcpListener::bind(state.client_address).await?.into_std()?;
    let (router, owner) = prepare_native_room_publication(actual, normal)?;
    let selected = owner.identity();
    // A same-owner observation must refuse before a real publication request.
    if owner.observe().await.is_ok() {
        return Err("provisioning must not publish native routes".into());
    }
    let endpoint = tokio::net::TcpListener::bind("127.0.0.1:0").await?;
    let address = endpoint.local_addr()?;
    state.publications.push(owner);
    state.tasks.push(service::start(router, endpoint));
    state.publication_offer = Some(Offer {
        selection: selected,
        endpoint: format!("http://{address}/recovery/native-publication/v1/publish"),
    });
    // Reuse the independently provisioned activation operator account. Its
    // private token is already retained by State::offer, never public files.
    if state.offer.is_none() {
        protocol::refuse(request, "actual-activation-offer-missing")?;
        return Ok(false);
    }
    Ok(true)
}

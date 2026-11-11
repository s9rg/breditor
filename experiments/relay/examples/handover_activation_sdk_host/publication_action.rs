//! Hold a normal listener for the actual sealed successor's activation control.
use super::{Result, handover_action, service, state::State};
use breditor_collab_relay::server::{
    NativeRoomPublicationIdentity, prepare_native_room_publication,
};

pub(super) struct Offer {
    pub selection: NativeRoomPublicationIdentity,
    pub endpoint: String,
}

pub(super) async fn prepare(state: &mut State, request: u64) -> Result<bool> {
    if !handover_action::apply(state, request).await? {
        return Ok(false);
    }
    provision(state).await?;
    Ok(true)
}

pub(super) async fn provision(state: &mut State) -> Result {
    let activation = state.ready()?.active.activation_control()?;
    let normal = tokio::net::TcpListener::bind(state.client_address).await?.into_std()?;
    let (router, publication) = prepare_native_room_publication(activation, normal)?;
    if publication.observe().await.is_ok() {
        return Err("preparing publication unexpectedly started normal serving".into());
    }
    let operator = tokio::net::TcpListener::bind("127.0.0.1:0").await?;
    let address = operator.local_addr()?;
    state.publication_offer = Some(Offer {
        selection: publication.identity(),
        endpoint: format!("http://{address}/recovery/native-publication/v1/publish"),
    });
    state.publications.push(publication);
    state.tasks.push(service::start(router, operator));
    Ok(())
}

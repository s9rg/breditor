//! Read actual publication custody; this command never starts normal serving.
use super::{Result, protocol, service, state::State, storage};
pub(super) async fn apply(state: &mut State, request: u64) -> Result<bool> {
    if state.serving {
        protocol::refuse(request, "no-pending-publication")?;
        return Ok(false);
    }
    let Some(owner) = state.publications.last() else {
        protocol::refuse(request, "actual-publication-owner-missing")?;
        return Ok(false);
    };
    let Ok(receipt) = owner.observe().await else {
        protocol::refuse(request, "actual-native-publication-not-observed")?;
        return Ok(false);
    };
    let ready = state.ready()?;
    let authority = breditor_collab_relay::server::RoomDeploymentAuthority::open_at_least(
        &ready.root.join("authority"),
        ready.checkpoint.identity().planned_selection(),
    )?;
    let actual = authority.current_selection()?;
    if actual != receipt.selection.activation.planned {
        return Err("actual publication epoch differs".into());
    }
    storage::write_new(
        &ready.root.join(format!("sdk-native-publication-{}-observed.json", state.sequence)),
        &serde_json::to_vec(&serde_json::json!({
            "format":"breditor/sdk-native-publication-observation","formatVersion":1,
            "receipt":receipt,"actualDeployment":actual,
            "normalServingStartedByAuthenticatedHttp":true,"observerStartedNormalServing":false,
            "wholeRoomActivated":false,
        }))?,
    )?;
    // A retired-source endpoint exists only for negative protocol assertions.
    // It cannot serve the new room and does not substitute for publication.
    let retired_router = ready.old_router.clone();
    let retired = tokio::net::TcpListener::bind(state.retired_address).await?;
    state.tasks.push(service::start(retired_router, retired));
    state.previous = Some(state.predecessor()?);
    state.sequence = request;
    state.offer = None;
    state.publication_offer = None;
    state.serving = true;
    Ok(true)
}

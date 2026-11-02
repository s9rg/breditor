//! Serve only after the real authenticated control returns its active router.
use super::{Result, protocol, service, state::State, storage};
pub(super) async fn apply(state: &mut State, request: u64) -> Result<bool> {
    if state.serving {
        protocol::refuse(request, "no-pending-activation")?;
        return Ok(false);
    }
    let ready = state.ready()?;
    let Ok(router) = ready.active.router().await else {
        protocol::refuse(request, "actual-native-service-not-committed")?;
        return Ok(false);
    };
    let clients = tokio::net::TcpListener::bind(state.client_address).await?;
    let retired = tokio::net::TcpListener::bind(state.retired_address).await?;
    let old_router = ready.old_router.clone();
    let file = ready.root.join(format!("sdk-native-activation-{}-committed.json", state.sequence));
    let selection =
        state.offer.as_ref().ok_or("actual activation offer missing")?.selection.clone();
    // Read the real durable authority again, separately from the HTTP receipt.
    let authority = breditor_collab_relay::server::RoomDeploymentAuthority::open_at_least(
        &ready.root.join("authority"),
        ready.checkpoint.identity().planned_selection(),
    )?;
    let actual = authority.current_selection()?;
    if &actual != ready.checkpoint.identity().planned_selection() {
        return Err("actual native epoch differs".into());
    }
    storage::write_new(
        &file,
        &serde_json::to_vec(
            &serde_json::json!({"format":"breditor/sdk-native-activation-observation","formatVersion":1,"choice":selection,"actualDeployment":actual,"actualNativeServiceRouterReturned":true,"wholeRoomActivated":false}),
        )?,
    )?;
    state.tasks.push(service::start(router, clients));
    state.tasks.push(service::start(old_router, retired));
    state.previous = Some(state.predecessor()?);
    state.sequence = request;
    state.offer = None;
    state.serving = true;
    Ok(true)
}

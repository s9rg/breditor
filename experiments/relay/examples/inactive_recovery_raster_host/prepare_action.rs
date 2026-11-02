//! Capture first, then retire serving custody and publish an inactive control.
use super::{
    Result, protocol, service, stage,
    state::{Offer, State},
};
use breditor_collab_relay::server::ServerLogGenerationRecoveryStateIdentity;
pub(super) async fn apply(
    state: &mut State,
    request: u64,
    source: &ServerLogGenerationRecoveryStateIdentity,
) -> Result<bool> {
    if !state.serving {
        protocol::refuse(request, "activation-already-prepared")?;
        return Ok(false);
    }
    let Ok(prepared) = Box::pin(stage::prepare(state.ready()?, request, source)).await else {
        protocol::refuse(request, "selected-source-or-custody-stale")?;
        return Ok(false);
    };
    state.stop_services().await?;
    let ready = state.ready.take().ok_or("actual native owner missing")?;
    let (current, prepared) = Box::pin(stage::finish(ready, prepared)).await?;
    state.ready = Some(current);
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await?;
    let endpoint =
        format!("http://{}/recovery/native-activation/v1/commit", listener.local_addr()?);
    state.tasks.push(service::start(prepared.router, listener));
    state.offer = Some(Offer {
        sequence: request,
        selection: serde_json::to_value(prepared.selection)?,
        endpoint,
        token: prepared.token,
    });
    state.previous = Some(state.predecessor()?);
    state.sequence = request;
    state.serving = false;
    Ok(true)
}

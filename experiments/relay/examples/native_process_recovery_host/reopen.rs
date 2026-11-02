//! Compose actual custody, fresh authentication and read-only startup before activation.
use super::{
    Result, observed, reacquire, restore_ready, service,
    state::{Offer, State},
    storage,
};
use breditor_collab_relay::server::NativeGenerationActivationCheckpointStatus as Status;
pub(super) async fn start() -> Result<State> {
    let input = super::bootstrap::read()?;
    let observed = observed::read(&input)?;
    let reacquired = Box::pin(reacquire::apply(input)).await?;
    let restore_ready::Restored { input, ready, router, token, selection, identity, status } =
        restore_ready::apply(reacquired, &observed)?;
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await?;
    let endpoint =
        format!("http://{}/recovery/native-activation/v1/commit", listener.local_addr()?);
    let observation = serde_json::json!({"format":"breditor/native-process-recovery-observation","formatVersion":1,"processId":std::process::id(),"previousCheckpointStatus":if status==Status::Committed{"committed"}else{"prepared"},"oldSelection":identity.planned_selection(),"freshSelection":selection,"actualSameTargetReacquired":true,"freshAccountAuthentication":true,"allProtectedRegistrationsVerified":true,"nativeServiceStillInactive":true,"wholeRoomActivated":false});
    storage::write_new(
        &input.root.join(format!("native-process-reopen-{}.json", input.next_sequence)),
        &serde_json::to_vec(&observation)?,
    )?;
    let previous = Some((
        input.previous_sequence,
        observed.get(&input.previous_sequence).ok_or("predecessor")?.clone(),
    ));
    Ok(State {
        ready: Some(ready),
        client_address: input.client_address,
        retired_address: input.retired_address,
        tasks: vec![service::start(router, listener)],
        controls: Vec::new(),
        inspections: Vec::new(),
        observed,
        sequence: input.next_sequence,
        previous,
        serving: false,
        offer: Some(Offer {
            sequence: input.next_sequence,
            selection: serde_json::to_value(selection)?,
            endpoint,
            token,
        }),
    })
}

//! Opt-in actual Native service restart with retained checkpoint/operational custody.
//! Generated credentials travel ONLY over private inherited IPC. Public files
//! contain actual snapshots/bindings but no resume, account or operator secrets.
#[path = "joint_restart_host/activate.rs"]
mod activate;
#[path = "selected_delivery_host/authentication.rs"]
mod authentication;
#[path = "joint_restart_host/begin.rs"]
mod begin;
#[path = "complete_cohort_fixture/clients.rs"]
mod clients;
#[path = "selected_delivery_host/credentials.rs"]
mod credentials;
#[path = "selected_delivery_host/full_path.rs"]
mod full_path;
#[path = "selected_delivery_host/inspection.rs"]
mod inspection;
#[path = "joint_restart_host/next.rs"]
mod next;
#[path = "joint_restart_host/protocol.rs"]
mod protocol;
#[path = "generation_complete_control/public_inputs.rs"]
mod public_inputs;
#[path = "joint_restart_host/restart.rs"]
mod restart;
#[path = "joint_restart_host/seed.rs"]
mod seed;
#[path = "joint_restart_host/service.rs"]
mod service;
#[path = "joint_restart_host/setup.rs"]
mod setup;
#[path = "selected_delivery_host/snapshot.rs"]
mod snapshot;
#[path = "server_generation_inventory_fixture/source.rs"]
mod source;
#[path = "participant_inventory_fixture/storage.rs"]
mod storage;
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error + Send + Sync>>;

/// Serve actual selected-delivery sources and snapshots through private fixture IPC.
/// # Errors
/// Rejects invalid profile flags, failed native preparation, storage or IPC errors.
#[tokio::main(worker_threads = 2)]
pub async fn main() -> Result {
    let (mut ready, clients, retired) = Box::pin(begin::prepare()).await?;
    let endpoint = format!("ws://{}/ws", clients.local_addr()?);
    let old_endpoint = format!("ws://{}/ws", retired.local_addr()?);
    let client_address = clients.local_addr()?;
    let retired_address = retired.local_addr()?;
    let mut tasks = vec![
        service::start(ready.active.router(), clients),
        service::start(ready.old_router.clone(), retired),
    ];
    let mut controls = Vec::new();
    let mut inspections = Vec::new();
    let mut input = protocol::read();
    let mut sequence = 0_u64;
    let mut previous = None;
    let mut observed = std::collections::BTreeMap::new();
    loop {
        let snapshot = Box::pin(snapshot::capture(
            &ready,
            sequence,
            &endpoint,
            &old_endpoint,
            previous.as_ref(),
            &observed,
        ))
        .await?;
        observed.insert(sequence, snapshot.archive);
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await?;
        let mut public = snapshot.public;
        public["endpoint"] = serde_json::json!(format!(
            "http://{}/recovery/generations/v1/check",
            listener.local_addr()?
        ));
        public["deliveryEndpoint"] = serde_json::json!(format!(
            "http://{}/recovery/generation-delivery/v1/check",
            listener.local_addr()?
        ));
        public["deliveryPathEndpoint"] = serde_json::json!(format!(
            "http://{}/recovery/generation-delivery-path/v1/check",
            listener.local_addr()?
        ));
        controls.push(snapshot.control);
        tasks.push(service::start(snapshot.router, listener));
        protocol::reply(
            &serde_json::json!({"kind":"snapshot","format":"breditor/native-selected-delivery-host", "formatVersion":1,
            "request":sequence,"case":public,"privateOperatorToken":snapshot.operator_token}),
        )?;
        let Some(action) =
            next::read(&ready, &mut input, &observed, sequence, &mut inspections).await?
        else {
            break;
        };
        match action {
            next::Action::Snapshot { request, previous: selected } => {
                previous = selected;
                sequence = request;
            }
            next::Action::Restart { request } => {
                let prepared = Box::pin(restart::prepare(&ready, request)).await?;
                for inspection in inspections.drain(..) {
                    inspection.close().await;
                }
                for control in controls.drain(..) {
                    control.close();
                }
                for task in tasks.drain(..) {
                    task.close().await?;
                }
                ready = Box::pin(restart::finish(ready, prepared)).await?;
                let clients = tokio::net::TcpListener::bind(client_address).await?;
                let retired = tokio::net::TcpListener::bind(retired_address).await?;
                tasks = vec![
                    service::start(ready.active.router(), clients),
                    service::start(ready.old_router.clone(), retired),
                ];
                previous = Some((
                    sequence,
                    observed.get(&sequence).ok_or("actual previous serving cut missing")?.clone(),
                ));
                sequence = request;
            }
        }
    }
    for inspection in inspections {
        inspection.close().await;
    }
    for control in controls {
        control.close();
    }
    for task in tasks {
        task.close().await?;
    }
    Ok(())
}

//! Real sealed-source/durable-target fixture for selected-owner delivery tests.
//! Generated credentials travel ONLY over private inherited IPC. Public files
//! contain actual snapshots/bindings but no resume, account or operator secrets.
#[path = "selected_delivery_host/activate.rs"]
mod activate;
#[path = "selected_delivery_host/authentication.rs"]
mod authentication;
#[path = "complete_cohort_fixture/clients.rs"]
mod clients;
#[path = "selected_delivery_host/credentials.rs"]
mod credentials;
#[path = "selected_delivery_host/full_path.rs"]
mod full_path;
#[path = "selected_delivery_host/next.rs"]
mod next;
#[path = "selected_delivery_host/protocol.rs"]
mod protocol;
#[path = "generation_complete_control/public_inputs.rs"]
mod public_inputs;
#[path = "selected_delivery_host/setup.rs"]
mod setup;
#[path = "selected_delivery_host/snapshot.rs"]
mod snapshot;
#[path = "server_generation_inventory_fixture/source.rs"]
mod source;
#[path = "participant_inventory_fixture/storage.rs"]
mod storage;
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error + Send + Sync>>;

fn serve(
    router: axum::Router,
    listener: tokio::net::TcpListener,
) -> tokio::task::JoinHandle<std::io::Result<()>> {
    tokio::spawn(async move { axum::serve(listener, router).await })
}
/// Serve actual selected-delivery sources and snapshots through private fixture IPC.
/// # Errors
/// Rejects invalid profile flags, failed native preparation, storage or IPC errors.
#[tokio::main(worker_threads = 2)]
pub async fn main() -> Result {
    let args: Vec<_> = std::env::args().skip(1).collect();
    let suggestions = args.last().is_some_and(|value| value == "suggestion-grants-v1");
    let selected = if suggestions { &args[..args.len() - 1] } else { args.as_slice() };
    let [parent, language, standard, atomic] = selected else {
        return Err("expected private parent, language1/2/3, standard0/1, atomic0/1".into());
    };
    let flag = |value: &str| -> Result<bool> {
        match value {
            "0" => Ok(false),
            "1" => Ok(true),
            _ => Err("explicit0/1 fixture flag".into()),
        }
    };
    let spec = source::Spec {
        language: language.parse()?,
        standard: flag(standard)?,
        atomic: flag(atomic)?,
    };
    let parent = std::fs::canonicalize(parent)?;
    if !parent.is_dir() {
        return Err("private fixture parent must exist".into());
    }
    let images =
        [std::fs::read(parent.join("seed-a.png"))?, std::fs::read(parent.join("seed-b.png"))?];
    // Pin the actual socket BEFORE any SDK source can be created with its binding.
    let clients = tokio::net::TcpListener::bind("127.0.0.1:0").await?;
    let retired = tokio::net::TcpListener::bind("127.0.0.1:0").await?;
    let endpoint = format!("ws://{}/ws", clients.local_addr()?);
    let old_endpoint = format!("ws://{}/ws", retired.local_addr()?);
    let ready = if suggestions {
        Box::pin(setup::prepare_with_suggestion_grants(&parent, spec, &images)).await?
    } else {
        Box::pin(setup::prepare(&parent, spec, &images)).await?
    };
    let mut tasks =
        vec![serve(ready.active.router(), clients), serve(ready.old_router.clone(), retired)];
    let mut controls = Vec::new();
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
        tasks.push(serve(snapshot.router, listener));
        protocol::reply(
            &serde_json::json!({"kind":"snapshot","format":"breditor/native-selected-delivery-host", "formatVersion":1,
            "request":sequence,"case":public,"privateOperatorToken":snapshot.operator_token}),
        )?;
        let Some((request, selected)) = next::read(&ready, &mut input, &observed, sequence).await?
        else {
            break;
        };
        previous = selected;
        sequence = request;
    }
    for control in controls {
        control.close();
    }
    for task in tasks {
        task.abort();
        let _ = task.await;
    }
    Ok(())
}

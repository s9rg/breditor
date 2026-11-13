//! Separate seven-writer image/provider fixture. Operator tokens use private IPC only.
#[path = "generation_complete_control/capture.rs"]
mod capture;
#[path = "complete_cohort_fixture/clients.rs"]
mod clients;
#[path = "generation_complete_control/migrated_origin.rs"]
mod migrated_origin;
#[path = "generation_complete_control/protected_streams.rs"]
mod protected_streams;
#[path = "generation_complete_control/public_inputs.rs"]
mod public_inputs;
#[path = "generation_complete_control/server_packet_asset.rs"]
mod server_packet_asset;
#[path = "server_generation_inventory_fixture/source.rs"]
mod source;
#[path = "participant_inventory_fixture/storage.rs"]
mod storage;
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;

#[tokio::main(worker_threads = 2)]
async fn main() -> Result {
    let args: Vec<_> = std::env::args_os().skip(1).collect();
    let (parent, migrated, server_packet_assets) = match args.as_slice() {
        [parent] => (parent, false, false),
        [parent, mode] if mode == "--migrated-origin" => (parent, true, false),
        [parent, mode] if mode == "--server-packet-assets" => (parent, false, true),
        _ => return Err("expected private fixture parent and optional fixture mode".into()),
    };
    let parent = std::fs::canonicalize(parent)?;
    if !parent.is_dir() {
        return Err("private fixture parent must exist".into());
    }
    let images =
        [std::fs::read(parent.join("seed-a.png"))?, std::fs::read(parent.join("seed-b.png"))?];
    let mut cases = Vec::new();
    let mut controls = Vec::new();
    let mut tasks = Vec::new();
    for (language, standard) in [(1, false), (2, false), (2, true), (3, false), (3, true)] {
        for atomic in [false, true] {
            if migrated && (language, standard, atomic) != (3, true, true) {
                continue;
            }
            let running = Box::pin(capture::generate(
                &parent,
                source::Spec { language, standard, atomic },
                Some(&images),
                migrated,
                server_packet_assets,
            ))
            .await?;
            let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await?;
            let address = listener.local_addr()?;
            cases.push(serde_json::json!({"path":running.path,"endpoint":format!("http://{address}/recovery/generations/v1/check"),"selection":running.control.identity(),"operatorToken":running.operator_token,"nativeProtectedStreamsVerified":true,"nativeProviderVerified":true}));
            controls.push(running.control);
            tasks.push(tokio::spawn(async move { axum::serve(listener, running.router).await }));
        }
    }
    println!(
        "{}",
        serde_json::json!({"format":"breditor/native-generation-complete-control-fixtures","formatVersion":1,"registeredWriters":7,"registeredReviewActors":7,"protectedStreams":14,"cases":cases})
    );
    tokio::signal::ctrl_c().await?;
    for control in &controls {
        control.close();
    }
    for task in tasks {
        task.abort();
        let _ = task.await;
    }
    drop(controls);
    Ok(())
}

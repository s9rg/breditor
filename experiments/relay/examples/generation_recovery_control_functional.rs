//! Test-only live operator controls and native client sources. Credentials leave only on private IPC.
#[path = "generation_recovery_control_functional/case.rs"]
mod case;
#[path = "participant_inventory_fixture/clients.rs"]
mod clients;
#[path = "server_generation_inventory_fixture/source.rs"]
mod source;
#[path = "participant_inventory_fixture/storage.rs"]
mod storage;
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;

#[tokio::main(worker_threads = 2)]
async fn main() -> Result {
    let args: Vec<_> = std::env::args_os().skip(1).collect();
    let [parent] = args.as_slice() else {
        return Err("expected existing private fixture parent".into());
    };
    let parent = std::fs::canonicalize(parent)?;
    if !parent.is_dir() {
        return Err("fixture parent is not a directory".into());
    }
    let mut rasters = Vec::new();
    for (width, height) in [(2, 3), (4, 5)] {
        let mut bytes = std::io::Cursor::new(Vec::new());
        image::DynamicImage::new_rgb8(width, height)
            .write_to(&mut bytes, image::ImageFormat::Png)?;
        rasters.push(bytes.into_inner());
    }
    let mut cases = Vec::new();
    let mut controls = Vec::new();
    let mut tasks = Vec::new();
    for (language, standard) in [(1, false), (2, false), (2, true), (3, false), (3, true)] {
        for atomic in [false, true] {
            let running = Box::pin(case::generate(
                &parent,
                source::Spec { language, standard, atomic },
                Some(&rasters),
            ))
            .await?;
            let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await?;
            let address = listener.local_addr()?;
            cases.push(serde_json::json!({"path":running.path,"endpoint":format!("http://{address}/recovery/generations/v1/check"),"selection":running.control.identity(),"operatorToken":running.operator_token,"nativeProtectedStreamsVerified":true,"nativeProviderVerified":true}));
            controls.push(running.control);
            tasks.push(tokio::spawn(async move { axum::serve(listener, running.router).await }));
        }
    }
    // Parent consumes this private pipe without saving/printing the tokens. Public fixture files
    // contain no operator/native token or protected resume secret. These are not editor routes.
    println!(
        "{}",
        serde_json::json!({"format":"breditor/native-generation-recovery-control-fixtures","formatVersion":1,"cases":cases})
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

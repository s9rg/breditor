//! Loopback-only reference relay CLI. No deployment or publication is performed by this binary.
use breditor_collab_relay::{
    Room,
    assets::AssetStore,
    server::{self, Authentication},
};
use serde_json::json;
use std::{fs::File, io::Read, net::SocketAddr, path::Path};

#[cfg(unix)]
mod raster_worker_limits;
mod sealed_inspection;

fn bounded(path: &str, max: u64) -> Result<String, Box<dyn std::error::Error>> {
    let mut value = String::new();
    File::open(path)?.take(max + 1).read_to_string(&mut value)?;
    if u64::try_from(value.len())? > max {
        return Err("configuration/input byte budget".into());
    }
    Ok(value)
}
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let args: Vec<&str> = args.iter().map(String::as_str).collect();
    if let ["raster-worker-v1", asset, mime] = args.as_slice() {
        #[cfg(unix)]
        raster_worker_limits::apply()?;
        server::run_raster_worker(asset, mime)?;
        return Ok(());
    }
    run_reference_cli(&args)
}

#[tokio::main(worker_threads = 2)]
async fn run_reference_cli(args: &[&str]) -> Result<(), Box<dyn std::error::Error>> {
    match args {
        ["token"] => {
            let (token, hash) = Authentication::issue_token()?;
            println!("{}", json!({"token":token,"tokenHash":hash}));
        }
        ["init", log, config, document, owner] => {
            Room::create(Path::new(log), &bounded(config, 256 * 1024)?, &bounded(document, 4 * 1024 * 1024)?, owner)?;
            println!("{}", json!({"kind":"created"}));
        }
        ["init-v2", log, config, document, owner] => {
            Room::create_structural_v2(Path::new(log), &bounded(config, 256 * 1024)?, &bounded(document, 4 * 1024 * 1024)?, owner)?;
            println!("{}", json!({"kind":"created","richLanguageVersion":2}));
        }
        ["init-standard-v2", log, config, document, owner] => {
            Room::create_standard_structural_v2(Path::new(log), &bounded(config, 256 * 1024)?, &bounded(document, 4 * 1024 * 1024)?, owner)?;
            println!("{}", json!({"kind":"created","richLanguageVersion":2}));
        }
        ["init-v3", log, config, document, owner] => {
            Room::create_layout_v3(Path::new(log), &bounded(config, 256 * 1024)?, &bounded(document, 4 * 1024 * 1024)?, owner)?;
            println!("{}", json!({"kind":"created","richLanguageVersion":3}));
        }
        ["init-standard-v3", log, config, document, owner] => {
            Room::create_standard_layout_v3(Path::new(log), &bounded(config, 256 * 1024)?, &bounded(document, 4 * 1024 * 1024)?, owner)?;
            println!("{}", json!({"kind":"created","richLanguageVersion":3}));
        }
        ["init-v4", log, config, document, owner] => {
            Room::create_language_v4(Path::new(log), &bounded(config, 256 * 1024)?, &bounded(document, 4 * 1024 * 1024)?, owner)?;
            println!("{}", json!({"kind":"created","richLanguageVersion":4}));
        }
        ["init-standard-v4", log, config, document, owner] => {
            Room::create_standard_language_v4(Path::new(log), &bounded(config, 256 * 1024)?, &bounded(document, 4 * 1024 * 1024)?, owner)?;
            println!("{}", json!({"kind":"created","richLanguageVersion":4}));
        }
        ["serve", log, auth, bind] | ["serve", log, auth, bind, "--isolated-raster"] => {
            let address: SocketAddr = bind.parse()?;
            if !address.ip().is_loopback() { return Err("reference relay currently requires loopback binding".into()); }
            let auth = Authentication::from_json(&bounded(auth, 256 * 1024)?)?;
            let (room, recovery) = Room::open(Path::new(log))?;
            let assets = AssetStore::open(Path::new(&format!("{log}.assets")),room.asset_binding())?;
            let (router, raster_monitor) = if args.len() == 5 {
                let (router, monitor) = server::router_with_observed_isolated_assets(room, auth, assets, std::env::current_exe()?)?;
                (router, Some(monitor))
            } else {
                (server::router_with_assets(room, auth, assets)?, None)
            };
            let listener = tokio::net::TcpListener::bind(address).await?;
            println!("{}", json!({"kind":"listening","address":listener.local_addr()?.to_string(),"recovery":recovery}));
            axum::serve(listener, router).with_graceful_shutdown(async { let _ = tokio::signal::ctrl_c().await; }).await?;
            if let Some(monitor) = raster_monitor {
                println!("{}", json!({"kind":"raster-worker-stats","stats":monitor.snapshot()}));
            }
        }
        ["serve-documents", directory, auth, api, bind] => {
            let address: SocketAddr = bind.parse()?;
            if !address.ip().is_loopback() { return Err("reference relay currently requires loopback binding".into()); }
            let auth = Authentication::from_json(&bounded(auth, 256 * 1024)?)?;
            let api = server::DocumentServerConfiguration::from_json(&bounded(api, 256 * 1024)?)?;
            let documents = server::DocumentServer::open(Path::new(directory), auth, api)?;
            let listener = tokio::net::TcpListener::bind(address).await?;
            println!("{}", json!({"kind":"listening","address":listener.local_addr()?.to_string(),"rooms":documents.rooms()}));
            axum::serve(listener, documents.router()).with_graceful_shutdown(async { let _ = tokio::signal::ctrl_c().await; }).await?;
        }
        ["inspect-sealed-room", request, auth, output] => {
            sealed_inspection::run(Path::new(request), Path::new(auth), Path::new(output)).await?;
        }
        ["repair-sealed-room", request, auth, evidence, selection_sha256, output] => {
            sealed_inspection::repair(
                Path::new(request), Path::new(auth), Path::new(evidence),
                selection_sha256, Path::new(output),
            ).await?;
        }
        _ => return Err("usage: breditor-collab-relay token | init|init-v2|init-standard-v2|init-v3|init-standard-v3 LOG PROFILE_JSON DOCUMENT_JSON OWNER | serve LOG AUTH_JSON LOOPBACK_ADDRESS [--isolated-raster] | serve-documents ROOMS_DIR AUTH_JSON DOCUMENT_API_JSON LOOPBACK_ADDRESS | inspect-sealed-room REQUEST_JSON AUTH_JSON NEW_EVIDENCE_DIR | repair-sealed-room REQUEST_JSON AUTH_JSON EVIDENCE_DIR SELECTION_SHA256 NEW_EVIDENCE_DIR".into()),
    }
    Ok(())
}

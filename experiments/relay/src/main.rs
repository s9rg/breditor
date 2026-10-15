//! Loopback-only reference relay CLI. No deployment or publication is performed by this binary.
use breditor_collab_relay::{
    Room,
    server::{self, Authentication},
};
use serde_json::json;
use std::{fs::File, io::Read, net::SocketAddr, path::Path};

fn bounded(path: &str, max: u64) -> Result<String, Box<dyn std::error::Error>> {
    let mut value = String::new();
    File::open(path)?.take(max + 1).read_to_string(&mut value)?;
    if u64::try_from(value.len())? > max {
        return Err("configuration/input byte budget".into());
    }
    Ok(value)
}
#[tokio::main(worker_threads = 2)]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    match args.iter().map(String::as_str).collect::<Vec<_>>().as_slice() {
        ["token"] => {
            let (token, hash) = Authentication::issue_token()?;
            println!("{}", json!({"token":token,"tokenHash":hash}));
        }
        ["init", log, config, document, owner] => {
            Room::create(Path::new(log), &bounded(config, 256 * 1024)?, &bounded(document, 4 * 1024 * 1024)?, owner)?;
            println!("{}", json!({"kind":"created"}));
        }
        ["serve", log, auth, bind] => {
            let address: SocketAddr = bind.parse()?;
            if !address.ip().is_loopback() { return Err("reference relay currently requires loopback binding".into()); }
            let auth = Authentication::from_json(&bounded(auth, 256 * 1024)?)?;
            let (room, recovery) = Room::open(Path::new(log))?;
            let listener = tokio::net::TcpListener::bind(address).await?;
            println!("{}", json!({"kind":"listening","address":listener.local_addr()?.to_string(),"recovery":recovery}));
            axum::serve(listener, server::router(room, auth)).with_graceful_shutdown(async { let _ = tokio::signal::ctrl_c().await; }).await?;
        }
        _ => return Err("usage: breditor-collab-relay token | init LOG PROFILE_JSON DOCUMENT_JSON OWNER | serve LOG AUTH_JSON LOOPBACK_ADDRESS".into()),
    }
    Ok(())
}

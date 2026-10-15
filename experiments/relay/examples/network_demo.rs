//! Loopback developer host with two explicitly provisioned accounts, not public deployment.
use breditor_collab_relay::{
    Role, Room,
    assets::AssetStore,
    server::{self, Authentication},
};
use serde_json::json;
use std::{fs::File, io::Read, net::SocketAddr, path::Path};
fn bounded(path: &str, max: u64) -> Result<String, Box<dyn std::error::Error>> {
    let mut value = String::new();
    File::open(path)?.take(max + 1).read_to_string(&mut value)?;
    if u64::try_from(value.len())? > max {
        return Err("demo input budget".into());
    }
    Ok(value)
}
#[tokio::main(worker_threads = 2)]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args = std::env::args().skip(1).collect::<Vec<_>>();
    let [log, configuration, document, auth, bind] = args.as_slice() else {
        return Err("expected LOG PROFILE_JSON DOCUMENT_JSON AUTH_JSON LOOPBACK_ADDRESS".into());
    };
    let address: SocketAddr = bind.parse()?;
    if !address.ip().is_loopback() {
        return Err("demo requires loopback".into());
    }
    let room = if Path::new(log).exists() {
        Room::open(Path::new(log))?.0
    } else {
        let mut room = Room::create(
            Path::new(log),
            &bounded(configuration, 256 * 1024)?,
            &bounded(document, 4 * 1024 * 1024)?,
            "demo-owner",
        )?;
        room.grant("demo-owner", "alice", Some(Role::Editor))?;
        room.grant("demo-owner", "bob", Some(Role::Editor))?;
        room
    };
    let assets = AssetStore::open(Path::new(&format!("{log}.assets")), room.asset_binding())?;
    let router = server::router_with_assets(
        room,
        Authentication::from_json(&bounded(auth, 256 * 1024)?)?,
        assets,
    )?;
    let listener = tokio::net::TcpListener::bind(address).await?;
    println!("{}", json!({"kind":"listening","address":listener.local_addr()?.to_string()}));
    axum::serve(listener, router)
        .with_graceful_shutdown(async {
            let _ = tokio::signal::ctrl_c().await;
        })
        .await?;
    Ok(())
}

//! Isolated loopback functional host for explicit standard-layout V3 / writer transport V2.
//! Existing developer rooms and original constructors are never migrated by this example.
use breditor_collab_relay::{
    AtomicTransportProfile, Role, Room,
    assets::AssetStore,
    server::{self, Authentication},
};
use serde_json::json;
use std::{fs::File, io::Read, net::SocketAddr, path::Path};

fn bounded(path: &str, max: u64) -> Result<String, Box<dyn std::error::Error>> {
    let mut value = String::new();
    File::open(path)?.take(max + 1).read_to_string(&mut value)?;
    if u64::try_from(value.len())? > max {
        return Err("functional input budget".into());
    }
    Ok(value)
}

#[tokio::main(worker_threads = 2)]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args = std::env::args().skip(1).collect::<Vec<_>>();
    let [log, configuration, document, auth, bind, ..] = args.as_slice() else {
        return Err(
            "expected LOG PROFILE_JSON DOCUMENT_JSON AUTH_JSON LOOPBACK_ADDRESS [ASSETS]".into()
        );
    };
    if args.len() > 6 {
        return Err("unexpected functional host argument".into());
    }
    let address: SocketAddr = bind.parse()?;
    if !address.ip().is_loopback() {
        return Err("functional host requires loopback".into());
    }
    let room = if Path::new(log).exists() {
        Room::open(Path::new(log))?.0
    } else {
        let mut room = Room::create_atomic_transport_v2(
            Path::new(log),
            &bounded(configuration, 256 * 1024)?,
            &bounded(document, 4 * 1024 * 1024)?,
            "functional-owner",
            AtomicTransportProfile::LayoutV3 { standard_inline_v1: true },
        )?;
        room.grant("functional-owner", "alice", Some(Role::Editor))?;
        room.grant("functional-owner", "bob", Some(Role::Editor))?;
        room
    };
    if room.writer_transport_version() != 2 {
        return Err("functional host requires an explicitly created V2 room".into());
    }
    let authentication = Authentication::from_json(&bounded(auth, 256 * 1024)?)?;
    // Asset transport is explicit. Existing five-argument document-only runs stay unchanged.
    let router = if let Some(path) = args.get(5) {
        let assets = AssetStore::open(Path::new(path), room.asset_binding())?;
        server::router_with_assets(room, authentication, assets)?
    } else {
        server::router(room, authentication)
    };
    let listener = tokio::net::TcpListener::bind(address).await?;
    println!("{}", json!({"kind":"listening","address":listener.local_addr()?.to_string()}));
    axum::serve(listener, router)
        .with_graceful_shutdown(async {
            let _ = tokio::signal::ctrl_c().await;
        })
        .await?;
    Ok(())
}

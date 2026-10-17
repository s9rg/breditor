//! Isolated advanced-review plus real raster-transfer fixture. Never upgrades existing rooms.
use breditor_collab_relay::{
    AtomicTransportProfile, Role, Room, SuggestionRole,
    assets::AssetStore,
    server::{self, Authentication},
};
use serde_json::json;
use std::{fs::File, io::Read, net::SocketAddr, path::Path};
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;
fn bounded(path: &str, max: u64) -> Result<String> {
    let mut value = String::new();
    File::open(path)?.take(max + 1).read_to_string(&mut value)?;
    if u64::try_from(value.len())? > max {
        return Err("functional input budget".into());
    }
    Ok(value)
}
#[tokio::main(worker_threads = 2)]
async fn main() -> Result {
    let args = std::env::args().skip(1).collect::<Vec<_>>();
    let [log, configuration, document, auth, bind, asset_path] = args.as_slice() else {
        return Err(
            "expected LOG PROFILE_JSON DOCUMENT_JSON AUTH_JSON LOOPBACK_ADDRESS ASSETS".into()
        );
    };
    let address: SocketAddr = bind.parse()?;
    if !address.ip().is_loopback() {
        return Err("functional host requires loopback".into());
    }
    let room = if Path::new(log).exists() {
        Room::open(Path::new(log))?.0
    } else {
        let mut room = Room::create_atomic_transport_v2(
            Path::new(log),
            &bounded(configuration, 262_144)?,
            &bounded(document, 4_194_304)?,
            "functional-owner",
            AtomicTransportProfile::LayoutV3 { standard_inline_v1: true },
        )?;
        room.enable_document_suggestions("functional-owner")?;
        room.enable_document_suggestion_revisions("functional-owner")?;
        room.enable_review("functional-owner")?;
        room.enable_document_versions("functional-owner")?;
        for principal in ["alice", "bob"] {
            room.grant("functional-owner", principal, Some(Role::Editor))?;
            room.grant_document_suggestions(
                "functional-owner",
                principal,
                Some(SuggestionRole::Review),
            )?;
        }
        room.grant("functional-owner", "carol", Some(Role::Reader))?;
        room
    };
    room.document_suggestion_revisions_descriptor("functional-owner")?;
    let assets = AssetStore::open(Path::new(asset_path), room.asset_binding())?;
    let authentication = Authentication::from_json(&bounded(auth, 262_144)?)?;
    let router = server::router_with_assets(room, authentication, assets)?;
    let listener = tokio::net::TcpListener::bind(address).await?;
    println!("{}", json!({"kind":"listening","address":listener.local_addr()?.to_string()}));
    axum::serve(listener, router)
        .with_graceful_shutdown(async {
            let _ = tokio::signal::ctrl_c().await;
        })
        .await?;
    Ok(())
}

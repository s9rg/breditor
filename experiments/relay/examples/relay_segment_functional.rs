//! Loopback fixture with separate old, handoff, and successor process lifetimes.
#[path = "server_generation_inventory_fixture/source.rs"]
mod source;
#[path = "participant_inventory_fixture/storage.rs"]
mod storage;

use breditor_collab_relay::{
    RelaySegmentBaseFile, RelaySegmentBaseIdentity, Room,
    assets::{AssetStore, asset_id, prepare_asset},
    server::{self, Authentication},
};
use serde_json::json;
use std::{
    fs::{self, File},
    io::{Read, Write},
    net::SocketAddr,
    path::Path,
    sync::Arc,
};

type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;

fn read(path: &Path, limit: u64) -> Result<String> {
    let mut value = String::new();
    File::open(path)?.take(limit + 1).read_to_string(&mut value)?;
    if value.len() as u64 > limit {
        return Err("relay segment fixture input budget".into());
    }
    Ok(value)
}

fn base(parent: &Path, identity: &RelaySegmentBaseIdentity) -> Result<Arc<RelaySegmentBaseFile>> {
    Ok(Arc::new(RelaySegmentBaseFile::open(
        File::open(parent.join("base.archive"))?,
        File::open(parent.join("base.checkpoint"))?,
        identity,
    )?))
}

fn create_base_file(path: &Path) -> Result<File> {
    use std::os::unix::fs::OpenOptionsExt;
    Ok(fs::OpenOptions::new().write(true).create_new(true).mode(0o600).open(path)?)
}

fn handoff(parent: &Path) -> Result {
    let old_path = parent.join("source-native");
    let (mut old, _) = Room::open_log_generations(&old_path)?;
    let mut archive = create_base_file(&parent.join("base.archive"))?;
    let mut checkpoint = create_base_file(&parent.join("base.checkpoint"))?;
    let identity = old.write_relay_segment_base("owner", &mut archive, &mut checkpoint)?;
    archive.sync_all()?;
    checkpoint.sync_all()?;
    storage::write_new(&parent.join("base.json"), &serde_json::to_vec(&identity)?)?;
    File::open(parent)?.sync_all()?;
    let current = old.log_generation_descriptor("owner")?;
    let successor = old.continue_into_relay_segment(
        "owner",
        &parent.join("successor"),
        base(parent, &identity)?,
        "successor-one",
    )?;
    assert_eq!(successor.log_generation_descriptor("owner")?.next_sequence, current.next_sequence);
    assert!(old.catchup("owner").is_err());
    println!("{}", json!({"kind":"handedOff","records":current.next_sequence}));
    Ok(())
}

#[tokio::main(worker_threads = 2)]
async fn main() -> Result {
    let args = std::env::args().skip(1).collect::<Vec<_>>();
    let [parent, mode, address] = args.as_slice() else {
        return Err("expected fixture directory, mode and loopback address".into());
    };
    let parent = Path::new(parent);
    let address: SocketAddr = address.parse()?;
    if !address.ip().is_loopback() {
        return Err("relay segment fixture requires loopback".into());
    }
    let old = parent.join("source-native");
    let png = fs::read(parent.join("asset.png"))?;
    let id = asset_id(&png);
    let (room, assets) = match mode.as_str() {
        "start" => {
            let source::Source { mut room, configuration, profile: _ } = source::create(
                parent,
                source::Spec { language: 3, standard: true, atomic: true },
                Some(&id),
            )?;
            storage::write_new(&parent.join("profile.json"), configuration.as_bytes())?;
            for i in 2..64 {
                room.grant("owner", "reader", Some(breditor_collab_relay::Role::Reader))?;
                room.rotate_log_generation("owner", &format!("file-{i}"))?;
            }
            let mut assets = AssetStore::open(&parent.join("rasters"), room.asset_binding())?;
            room.put_asset("owner", &mut assets, prepare_asset(&id, "image/png", png)?)?;
            (room, assets)
        }
        "handoff" => return handoff(parent),
        "successor" => {
            let identity = serde_json::from_str(&read(&parent.join("base.json"), 32 * 1024)?)?;
            let (mut room, _) = Room::open_relay_segment_successor(
                &old,
                &parent.join("successor"),
                base(parent, &identity)?,
            )?;
            let _ = room.relay_segment_retained_asset_references("owner")?;
            let assets = AssetStore::open(&parent.join("rasters"), room.asset_binding())?;
            (room, assets)
        }
        _ => return Err("unknown fixture mode".into()),
    };
    let authentication = Authentication::from_json(&read(&parent.join("auth.json"), 256 * 1024)?)?;
    let listener = tokio::net::TcpListener::bind(address).await?;
    println!("{}", json!({"kind":"listening","address":listener.local_addr()?.to_string()}));
    std::io::stdout().flush()?;
    axum::serve(listener, server::router_with_assets(room, authentication, assets)?)
        .with_graceful_shutdown(async {
            let _ = tokio::signal::ctrl_c().await;
        })
        .await?;
    Ok(())
}

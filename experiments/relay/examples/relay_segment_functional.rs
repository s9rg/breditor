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

fn saved_base(
    parent: &Path,
    lane: &str,
    prior: Option<Arc<RelaySegmentBaseFile>>,
) -> Result<Arc<RelaySegmentBaseFile>> {
    let identity: RelaySegmentBaseIdentity =
        serde_json::from_str(&read(&parent.join(format!("{lane}.json")), 32 * 1024)?)?;
    let archive = File::open(parent.join(format!("{lane}.archive")))?;
    let checkpoint = File::open(parent.join(format!("{lane}.checkpoint")))?;
    let base = if let Some(prior) = prior {
        RelaySegmentBaseFile::open_linked(archive, checkpoint, &identity, prior)?
    } else {
        RelaySegmentBaseFile::open(archive, checkpoint, &identity)?
    };
    Ok(Arc::new(base))
}

fn create_base_file(path: &Path) -> Result<File> {
    use std::os::unix::fs::OpenOptionsExt;
    Ok(fs::OpenOptions::new().write(true).create_new(true).mode(0o600).open(path)?)
}

fn continue_room(
    parent: &Path,
    mut room: Room,
    lane: &str,
    target: &str,
    generation: &str,
    prior: Option<Arc<RelaySegmentBaseFile>>,
) -> Result {
    let mut archive = create_base_file(&parent.join(format!("{lane}.archive")))?;
    let mut checkpoint = create_base_file(&parent.join(format!("{lane}.checkpoint")))?;
    let identity = room.write_relay_segment_base("owner", &mut archive, &mut checkpoint)?;
    archive.sync_all()?;
    checkpoint.sync_all()?;
    storage::write_new(&parent.join(format!("{lane}.json")), &serde_json::to_vec(&identity)?)?;
    File::open(parent)?.sync_all()?;
    let current = room.log_generation_descriptor("owner")?;
    let successor = room.continue_into_relay_segment(
        "owner",
        &parent.join(target),
        saved_base(parent, lane, prior)?,
        generation,
    )?;
    assert_eq!(successor.log_generation_descriptor("owner")?.next_sequence, current.next_sequence);
    assert!(room.catchup("owner").is_err());
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
        "handoff" => {
            let (room, _) = Room::open_log_generations(&old)?;
            return continue_room(parent, room, "base", "successor", "successor-one", None);
        }
        "handoff-again" => {
            let prior = saved_base(parent, "base", None)?;
            let (mut room, _) =
                Room::open_relay_segment_successor(&old, &parent.join("successor"), prior.clone())?;
            // Fill all 64 real WAL slots in the first successor before moving again.
            for i in 2..=64 {
                room.grant("owner", "reader", Some(breditor_collab_relay::Role::Reader))?;
                room.rotate_log_generation("owner", &format!("successor-{i}"))?;
            }
            return continue_room(parent, room, "linked", "final", "final-one", Some(prior));
        }
        "successor" | "final" => {
            let prior = saved_base(parent, "base", None)?;
            let successor = parent.join("successor");
            let (mut room, _) = if mode == "successor" {
                Room::open_relay_segment_successor(&old, &successor, prior)?
            } else {
                let base = saved_base(parent, "linked", Some(prior))?;
                Room::open_relay_segment_chain(&[&old, &successor, &parent.join("final")], base)?
            };
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

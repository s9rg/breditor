//! Loopback fixture with separate old, handoff, and successor process lifetimes.
#[path = "server_generation_inventory_fixture/source.rs"]
mod source;
#[path = "participant_inventory_fixture/storage.rs"]
mod storage;

use breditor_collab_relay::{
    RelaySegmentBaseFile, RelaySegmentBaseIdentity, RelaySegmentRoomBackupFiles,
    RelaySegmentRoomBackupIdentity, Room, RoomRecoveryPolicy,
    assets::{AssetStore, asset_id, prepare_asset},
    server::{
        self, Authentication, RoomDeploymentAuthority, RoomDeploymentIdentity, RoomDeploymentLease,
    },
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

fn restored_backup(parent: &Path) -> Result<RelaySegmentRoomBackupFiles> {
    let first = saved_base(parent, "base", None)?;
    let second = saved_base(parent, "linked", Some(first))?;
    let current = saved_base(parent, "restored-base", Some(second))?;
    let identity: RelaySegmentRoomBackupIdentity =
        serde_json::from_str(&read(&parent.join("restore.json"), 32 * 1024)?)?;
    Ok(RelaySegmentRoomBackupFiles::open(
        current,
        File::open(parent.join("restored-base.rasters"))?,
        &identity,
    )?)
}

fn capture_restore(parent: &Path) -> Result {
    let old = parent.join("source-native");
    let successor = parent.join("successor");
    let current = parent.join("final");
    let first = saved_base(parent, "base", None)?;
    let second = saved_base(parent, "linked", Some(first))?;
    let (mut room, _) = Room::open_relay_segment_chain(&[&old, &successor, &current], second)?;
    let assets = AssetStore::open(&parent.join("rasters"), room.asset_binding())?;
    let mut archive = create_base_file(&parent.join("restored-base.archive"))?;
    let mut checkpoint = create_base_file(&parent.join("restored-base.checkpoint"))?;
    let mut raster_archive = create_base_file(&parent.join("restored-base.rasters"))?;
    let identity = room.write_relay_segment_room_backup(
        "owner",
        &assets,
        &mut archive,
        &mut checkpoint,
        &mut raster_archive,
    )?;
    for file in [&archive, &checkpoint, &raster_archive] {
        file.sync_all()?;
    }
    storage::write_new(&parent.join("restored-base.json"), &serde_json::to_vec(&identity.native)?)?;
    storage::write_new(&parent.join("restore.json"), &serde_json::to_vec(&identity)?)?;
    File::open(parent)?.sync_all()?;
    println!("{}", json!({"kind":"captured","records":identity.native.predecessor.source.records}));
    Ok(())
}

fn serving_epoch(parent: &Path, room: &Room, create: bool) -> Result<RoomDeploymentLease> {
    let path = parent.join("deployment");
    let identity_path = parent.join("deployment-identity.json");
    let authority = if create {
        let authority = RoomDeploymentAuthority::create(&path, &room.deployment_binding()?)?;
        storage::write_new(&identity_path, &serde_json::to_vec(&authority.identity())?)?;
        authority
    } else {
        let identity: RoomDeploymentIdentity = serde_json::from_str(&read(&identity_path, 4096)?)?;
        RoomDeploymentAuthority::open(&path, &identity)?
    };
    let expected = authority.current_selection()?;
    Ok(authority.claim(&expected)?)
}

fn restored_router(parent: &Path, create: bool, auth: Authentication) -> Result<axum::Router> {
    let backup = restored_backup(parent)?;
    let destination = parent.join("restored");
    let policy = RoomRecoveryPolicy::HostReacquired;
    let restored = if create {
        backup.restore(&destination, "restored-one", policy)?
    } else {
        backup.reopen(&destination, policy)?
    };
    let lease = serving_epoch(parent, restored.components().0, false)?;
    Ok(restored.into_serving_router(auth, lease)?)
}

fn source_router(
    room: Room,
    assets: AssetStore,
    parent: &Path,
    create: bool,
    auth: Authentication,
) -> Result<axum::Router> {
    let epoch = serving_epoch(parent, &room, create)?;
    Ok(server::router_with_assets_and_deployment_lease(room, auth, assets, epoch)?)
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
    let auth = Authentication::from_json(&read(&parent.join("auth.json"), 256 * 1024)?)?;
    let router = match mode.as_str() {
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
            source_router(room, assets, parent, true, auth)?
        }
        "capture-restore" => return capture_restore(parent),
        "restore" | "restored" => restored_router(parent, mode == "restore", auth)?,
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
            source_router(room, assets, parent, false, auth)?
        }
        _ => return Err("unknown fixture mode".into()),
    };
    let listener = tokio::net::TcpListener::bind(address).await?;
    println!("{}", json!({"kind":"listening","address":listener.local_addr()?.to_string()}));
    std::io::stdout().flush()?;
    axum::serve(listener, router)
        .with_graceful_shutdown(async {
            let _ = tokio::signal::ctrl_c().await;
        })
        .await?;
    Ok(())
}

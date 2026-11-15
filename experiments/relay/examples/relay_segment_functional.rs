//! Loopback fixture with separate old, handoff, and successor process lifetimes.
#[path = "relay_segment_functional/handover.rs"]
mod handover;
#[path = "server_generation_inventory_fixture/source.rs"]
mod source;
#[path = "participant_inventory_fixture/storage.rs"]
mod storage;

use breditor_collab_relay::{
    RelaySegmentBaseFile, RelaySegmentBaseIdentity, RelaySegmentRoomBackupFiles,
    RelaySegmentRoomBackupIdentity, Room,
    assets::{AssetStore, asset_id, prepare_asset},
    server::{
        self, Authentication, RoomDeploymentAuthority, RoomDeploymentIdentity, RoomDeploymentLease,
        ServerBackupHandle,
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

type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error + Send + Sync>>;

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

fn captured_base(
    capture: &Path,
    selection: &Path,
    prior: Arc<RelaySegmentBaseFile>,
) -> Result<(Arc<RelaySegmentBaseFile>, RelaySegmentRoomBackupIdentity)> {
    let identity: RelaySegmentRoomBackupIdentity =
        serde_json::from_str(&read(selection, 32 * 1024)?)?;
    let base = Arc::new(RelaySegmentBaseFile::open_linked(
        File::open(capture.join("native.archive"))?,
        File::open(capture.join("native.checkpoint"))?,
        &identity.native,
        prior,
    )?);
    Ok((base, identity))
}

fn original_capture(
    parent: &Path,
) -> Result<(Arc<RelaySegmentBaseFile>, RelaySegmentRoomBackupIdentity)> {
    let first = saved_base(parent, "base", None)?;
    let second = saved_base(parent, "linked", Some(first))?;
    captured_base(&parent.join("capture"), &parent.join("restore.json"), second)
}

fn restored_backup(parent: &Path) -> Result<RelaySegmentRoomBackupFiles> {
    let (current, identity) = original_capture(parent)?;
    Ok(RelaySegmentRoomBackupFiles::open(
        current,
        File::open(parent.join("capture/rasters.archive"))?,
        &identity,
    )?)
}

fn deployment(parent: &Path) -> Result<RoomDeploymentAuthority> {
    let identity: RoomDeploymentIdentity =
        serde_json::from_str(&read(&parent.join("deployment-identity.json"), 4096)?)?;
    Ok(RoomDeploymentAuthority::open(&parent.join("deployment"), &identity)?)
}

fn configured_auth(parent: &Path) -> Result<Authentication> {
    Ok(Authentication::from_json(&read(&parent.join("auth.json"), 256 * 1024)?)?)
}

fn source_router(
    room: Room,
    assets: AssetStore,
    parent: &Path,
    create: bool,
    auth: Authentication,
) -> Result<(axum::Router, ServerBackupHandle)> {
    let authority = if create {
        let authority = RoomDeploymentAuthority::create(
            &parent.join("deployment"),
            &room.deployment_binding()?,
        )?;
        storage::write_new(
            &parent.join("deployment-identity.json"),
            &serde_json::to_vec(&authority.identity())?,
        )?;
        authority
    } else {
        deployment(parent)?
    };
    let epoch: RoomDeploymentLease = authority.claim(&authority.current_selection()?)?;
    Ok(server::router_with_server_backups_and_deployment_lease(room, auth, assets, epoch)?)
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
    let auth = configured_auth(parent)?;
    let (router, control) = match mode.as_str() {
        "start" => {
            let source::Source { mut room, configuration, profile: _ } = source::create(
                parent,
                source::Spec { language: 3, standard: true, atomic: true },
                Some(&id),
            )?;
            storage::write_new(&parent.join("profile.json"), configuration.as_bytes())?;
            storage::write_new(
                &parent.join("delivery-lanes.json"),
                &serde_json::to_vec(&serde_json::json!({
                    "suggestions": room.document_suggestions_descriptor("owner")?,
                    "revisions": room.document_suggestion_revisions_descriptor("owner")?,
                    "versions": room.document_versions_descriptor("owner")?,
                }))?,
            )?;
            for i in 2..64 {
                room.grant("owner", "reader", Some(breditor_collab_relay::Role::Reader))?;
                room.rotate_log_generation("owner", &format!("file-{i}"))?;
            }
            let mut assets = AssetStore::open(&parent.join("rasters"), room.asset_binding())?;
            room.put_asset("owner", &mut assets, prepare_asset(&id, "image/png", png)?)?;
            (source_router(room, assets, parent, true, auth)?.0, None)
        }
        "restore" | "restored" | "carried" => {
            handover::resumed_router(parent, auth, mode == "carried")?
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
            let (router, handle) = source_router(room, assets, parent, false, auth)?;
            let control =
                if mode == "final" { Some(handover::serve_control(parent, handle)) } else { None };
            (router, control)
        }
        _ => return Err("unknown fixture mode".into()),
    };
    let listener = tokio::net::TcpListener::bind(address).await?;
    println!("{}", json!({"kind":"listening","address":listener.local_addr()?.to_string()}));
    std::io::stdout().flush()?;
    let server = axum::serve(listener, router).with_graceful_shutdown(async {
        let _ = tokio::signal::ctrl_c().await;
    });
    if let Some(control) = control {
        tokio::select! {
            result = server => result?,
            result = control => result??,
        }
    } else {
        server.await?;
    }
    Ok(())
}

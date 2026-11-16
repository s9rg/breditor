//! Separate host lifetimes for authenticated continued-raster SDK integration.
use super::{Result, read, source, storage};
use breditor_collab_relay::{
    ContinuedAssetStore, ContinuedAssetStoreIdentity, Room,
    assets::{AssetStore, asset_id, prepare_asset},
    server::{
        Authentication, ContinuedAssetServerHandle, RoomDeploymentAuthority,
        RoomDeploymentIdentity, RoomDeploymentSelection,
        router_with_continued_assets_and_deployment_lease,
    },
};
use serde::Deserialize;
use serde_json::json;
use std::{fs::File, io::Write, path::Path};

const AUTHORITY: &str = "continued-epoch.json";
const STORE: &str = "continued-store.json";
const SELECTION: &str = "continued-last-selection.json";

pub(super) fn router(
    parent: &Path,
    auth: Authentication,
    png: &[u8],
    resume: bool,
) -> Result<(axum::Router, Option<tokio::task::JoinHandle<Result>>)> {
    let data = parent.join("continued");
    let epochs = parent.join("authority");
    let (room, authority, store, expected) = if resume {
        let (room, _) = Room::open_log_generations(&parent.join("source-native"))?;
        let identity: RoomDeploymentIdentity =
            serde_json::from_str(&read(&parent.join(AUTHORITY), 4096)?)?;
        let expected: RoomDeploymentSelection =
            serde_json::from_str(&read(&parent.join(SELECTION), 4096)?)?;
        let local: ContinuedAssetStoreIdentity =
            serde_json::from_str(&read(&parent.join(STORE), 4096)?)?;
        assert_eq!(expected.identity, identity);
        let authority = RoomDeploymentAuthority::open_at_least(&epochs, &expected)?;
        (room, authority, ContinuedAssetStore::open(&data, &local)?, expected)
    } else {
        let old = asset_id(png);
        let source::Source { room, configuration, .. } = source::create(
            parent,
            source::Spec { language: 3, standard: true, atomic: true },
            Some(&old),
        )?;
        storage::write_new(&parent.join("profile.json"), configuration.as_bytes())?;
        let mut assets = AssetStore::open(&parent.join("seed"), room.asset_binding())?;
        room.put_asset("owner", &mut assets, prepare_asset(&old, "image/png", png.to_vec())?)?;
        let archive = parent.join("seed.archive");
        let mut file = File::create_new(&archive)?;
        let identity = assets.write_backup(&mut file)?;
        file.sync_all()?;
        drop(assets);
        let store =
            ContinuedAssetStore::create_from_backup(&data, File::open(archive)?, &identity)?;
        storage::write_new(&parent.join(STORE), &serde_json::to_vec(store.identity())?)?;
        let authority = RoomDeploymentAuthority::create_with_coordinated_recovery(
            &epochs,
            &room.deployment_binding()?,
        )?;
        storage::write_new(&parent.join(AUTHORITY), &serde_json::to_vec(&authority.identity())?)?;
        let selection = authority.current_selection()?;
        (room, authority, store, selection)
    };
    let lease = authority.claim(&expected)?;
    let selected = serde_json::to_vec(&lease.selection())?;
    let (router, handle) =
        router_with_continued_assets_and_deployment_lease(room, auth, store, lease)?;
    if resume {
        storage::write_new(&parent.join("continued-reopened-selection.json"), &selected)?;
    } else {
        storage::write_new(&parent.join(SELECTION), &selected)?;
    }
    File::open(parent)?.sync_all()?;
    Ok((router, Some(control(parent, handle))))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Command {
    principal: String,
    token: String,
    action: Action,
}

#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
enum Action {
    Capture,
    CaptureActivation,
    CaptureRepairFloor,
    RotateNative { generation: String },
    SealActivation,
    Activate,
}

pub(super) fn control(
    parent: &Path,
    handle: ContinuedAssetServerHandle,
) -> tokio::task::JoinHandle<Result> {
    let parent = parent.to_path_buf();
    tokio::task::spawn_blocking(move || {
        while let Some(bytes) = super::handover::next_input()? {
            let Command { principal, token, action } = serde_json::from_slice(&bytes)?;
            let result = match action {
                Action::Capture => handle
                    .capture(&principal, &token, &parent.join("captured"))
                    .map(|capture| json!(capture))
                    .map_err(|error| error.to_string()),
                Action::CaptureActivation => handle
                    .capture(&principal, &token, &parent.join("activation-capture"))
                    .map(|capture| json!(capture))
                    .map_err(|error| error.to_string()),
                Action::CaptureRepairFloor => handle
                    .capture(&principal, &token, &parent.join("repair-floor"))
                    .map(|capture| json!(capture))
                    .map_err(|error| error.to_string()),
                Action::RotateNative { generation } => handle
                    .rotate_log_generation(&principal, &token, &generation)
                    .map(|receipt| json!(receipt))
                    .map_err(|error| error.to_string()),
                Action::SealActivation => {
                    super::continued_activation::seal(&parent, &handle, &principal, &token)
                        .map(|selection| json!(selection))
                        .map_err(|error| error.to_string())
                }
                Action::Activate => {
                    super::continued_activation::commit(&parent, &handle, &principal, &token)
                        .map(|selection| json!(selection))
                        .map_err(|error| error.to_string())
                }
            };
            let reply = match result {
                Ok(result) => json!({"kind": "maintenance", "result": result}),
                Err(error) => json!({"kind": "maintenance", "error": error}),
            };
            let mut output = std::io::stdout().lock();
            writeln!(output, "{reply}")?;
            output.flush()?;
        }
        Ok(())
    })
}

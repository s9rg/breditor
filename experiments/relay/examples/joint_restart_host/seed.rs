//! Create real seven-author source histories and the exact initial raster set.
use super::{Result, clients, source, storage};
use breditor_collab_relay::assets::{AssetStore, asset_id, prepare_asset};
use breditor_collab_relay::{
    RecoveryRegistrationCredentials, Role, ServerLogGenerationRoomBackup, SuggestionRole,
};
use serde_json::Value;
use std::path::{Path, PathBuf};
pub(super) struct Seeded {
    pub root: PathBuf,
    pub configuration: String,
    pub records: Value,
    pub protected: RecoveryRegistrationCredentials,
    pub secrets: Vec<String>,
    pub room: breditor_collab_relay::Room,
    pub assets: AssetStore,
    pub older: ServerLogGenerationRoomBackup,
}
fn seed_assets(
    directory: &Path,
    room: &mut breditor_collab_relay::Room,
    rasters: &[Vec<u8>],
) -> Result<AssetStore> {
    let mut assets = AssetStore::open(&directory.join("source-rasters"), room.asset_binding())?;
    for bytes in rasters {
        room.put_asset(
            "owner",
            &mut assets,
            prepare_asset(&asset_id(bytes), "image/png", bytes.clone())?,
        )?;
    }
    Ok(assets)
}
pub(super) fn prepare(
    parent: &Path,
    spec: source::Spec,
    rasters: &[Vec<u8>],
    suggestions: bool,
) -> Result<Seeded> {
    if rasters.len() != 2 {
        return Err("two private fixture rasters required".into());
    }
    let root = parent.join(spec.name());
    storage::directory(&root)?;
    storage::directory(&root.join("snapshots"))?;
    let source::Source {
        profile,
        mut room,
        configuration,
    } = source::create(&root, spec, Some(&asset_id(&rasters[0])))?;
    if suggestions {
        if !spec.atomic {
            return Err("suggestion review fixture requires the atomic writer protocol".into());
        }
        room.grant_document_suggestions("owner", "alice", Some(SuggestionRole::Review))?;
    }
    let clients::CapturedClients {
        records,
        protected,
        secrets,
    } = clients::capture(&mut room, &profile, spec)?;
    if protected.documents.len() != 7 || protected.reviews.len() != 7 {
        return Err("seven actual registered authors required".into());
    }
    let mut assets = seed_assets(&root, &mut room, rasters)?;
    room.seal_document_history_generation("owner", "document-two".into())?;
    room.rotate_log_generation("owner", "two")?;
    room.seal_review_history_generation("owner", "review-two".into())?;
    room.rotate_log_generation("owner", "three")?;
    let older = ServerLogGenerationRoomBackup::capture(&mut room, &mut assets, "owner")?;
    room.grant("owner", "control-local-reader", Some(Role::Reader))?;
    room.rotate_log_generation("owner", "control-local-origin")?;
    Ok(Seeded {
        root,
        configuration,
        records,
        protected,
        secrets,
        room,
        assets,
        older,
    })
}

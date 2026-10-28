//! Real original/current custody, absent-only restore and all separately protected registrations.
use super::{Result, clients, replay::Saved, source, storage};
use breditor_collab_feasibility::rich_replica::SharedRichProfile;
use breditor_collab_relay::{
    RoomRecoveryPolicy, ServerLogGenerationRoomBackup, ServerLogGenerationRoomRecovery,
    assets::{AssetStore, asset_id, prepare_asset},
    server::{
        Authentication, PreparedLogGenerationRecoveryHost, ServerLogGenerationRecoveryCoverage,
        ServerLogGenerationRecoveryStateIdentity, VerifiedServerLogGenerationRecoveryState,
        prepare_log_generation_recovery_host,
    },
};
use std::{
    io::Cursor,
    path::{Path, PathBuf},
    sync::Arc,
};

pub struct Case {
    pub directory: PathBuf,
    pub host: PreparedLogGenerationRecoveryHost,
    pub token: String,
    pub native: Arc<VerifiedServerLogGenerationRecoveryState>,
    pub expected: ServerLogGenerationRecoveryStateIdentity,
    pub original: ServerLogGenerationRoomBackup,
    pub profile: SharedRichProfile,
    pub saved: Saved,
    pub raster: String,
    pub secrets: Vec<String>,
    pub profile_bytes: usize,
}
pub async fn generate(parent: &Path) -> Result<Case> {
    let directory = parent.join("standalone-generation-assets");
    storage::directory(&directory)?;
    let spec = source::Spec { language: 3, standard: true, atomic: true };
    assert!(!spec.name().is_empty());
    let source::Source { profile, mut room, configuration } =
        source::create(&directory, spec, Some("opaque-image"))?;
    let clients::CapturedClients { records, protected, secrets } =
        clients::capture(&mut room, &profile, spec)?;
    let mut assets = AssetStore::open(&directory.join("rasters"), room.asset_binding())?;
    let mut image = Cursor::new(Vec::new());
    image::DynamicImage::new_rgb8(2, 3).write_to(&mut image, image::ImageFormat::Png)?;
    let image = image.into_inner();
    let raster = asset_id(&image);
    assets.put(prepare_asset(&raster, "image/png", image)?)?;
    room.seal_document_history_generation("owner", "document-two".into())?;
    room.seal_review_history_generation("owner", "review-two".into())?;
    room.rotate_log_generation("owner", "server-two")?;
    let original = ServerLogGenerationRoomBackup::capture(&mut room, &mut assets, "owner")?;
    let selected = original.info()?.identity;
    storage::write_new(&directory.join("original-server.brd"), &original.to_bytes()?)?;
    std::fs::File::open(&directory)?.sync_all()?;
    drop(room);
    drop(assets);
    let operation = ServerLogGenerationRoomRecovery::begin(
        &directory.join("restored"),
        &original,
        &selected,
        RoomRecoveryPolicy::HostReacquired,
    )?
    .finish(&original)?
    .begin_operation(&original, &selected, RoomRecoveryPolicy::HostReacquired, "owner")?;
    let (token, hash) = Authentication::issue_token()?;
    let auth=Authentication::from_json(&serde_json::json!({"format":"breditor/relay-auth","formatVersion":1,"accounts":[{"principal":"owner","tokenHash":hash}],"origins":["http://127.0.0.1:4187"]}).to_string())?;
    let host = Box::pin(prepare_log_generation_recovery_host(
        operation,
        auth,
        ServerLogGenerationRoomBackup::from_owned_bytes(original.to_bytes()?)?,
        &selected,
        "owner",
        &token,
    ))
    .await?;
    let state = host.capture_recovery_state("owner", &token).await?;
    let expected = state.identity()?;
    let (_, inventory) = state.into_parts();
    let metadata = inventory.metadata().native;
    let saved = Saved::capture(&records, &protected, &metadata)?;
    let ServerLogGenerationRecoveryCoverage::Verified(native) = host
        .verify_selected_recovery_state("owner", &token, expected.clone(), inventory, protected)
        .await?
    else {
        return Err("complete protected native source did not verify".into());
    };
    Ok(Case {
        directory,
        host,
        token,
        native: Arc::new(native),
        expected,
        original,
        profile,
        saved,
        raster,
        secrets,
        profile_bytes: configuration.len(),
    })
}

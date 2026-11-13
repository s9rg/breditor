//! Seven actual image-bearing native authors under genuine standalone origin/current custody.
use super::{Result, clients, migrated_origin, server_packet_asset, source, storage};
use breditor_collab_relay::{
    Role, RoomRecoveryPolicy, ServerLogGenerationRoomBackup, ServerLogGenerationRoomRecovery,
    assets::{AssetStore, asset_id, prepare_asset},
    server::{
        Authentication, ContentAddressedServerAssets, PreparedLogGenerationRecoveryHost,
        ServerLogGenerationRecoveryAssetCoverage, ServerLogGenerationRecoveryControl,
        VerifiedServerLogGenerationRecoveryState, prepare_log_generation_recovery_control,
        prepare_log_generation_recovery_host,
    },
};
use serde_json::json;
use std::{
    path::{Path, PathBuf},
    sync::Arc,
};

pub struct Running {
    pub path: PathBuf,
    pub router: axum::Router,
    pub control: ServerLogGenerationRecoveryControl,
    pub operator_token: String,
}
fn authentication(principal: &str) -> Result<(Authentication, String)> {
    let (token, hash) = Authentication::issue_token()?;
    Ok((Authentication::from_json(&json!({"format":"breditor/relay-auth","formatVersion":1,"origins":["http://127.0.0.1:4187"],"accounts":[{"principal":principal,"tokenHash":hash}]}).to_string())?,token))
}
async fn prepare_control(
    host: PreparedLogGenerationRecoveryHost,
    native: VerifiedServerLogGenerationRecoveryState,
    native_token: &str,
) -> Result<(axum::Router, ServerLogGenerationRecoveryControl, String)> {
    let provider: Arc<dyn breditor_collab_relay::server::ServerRecoveryAssetProvider> =
        Arc::new(ContentAddressedServerAssets);
    let ServerLogGenerationRecoveryAssetCoverage::Verified(proof) = host
        .verify_recovery_asset_availability(
            "owner",
            native_token,
            Arc::new(native),
            provider.clone(),
        )
        .await?
    else {
        return Err("native server provider".into());
    };
    let (operators, token) = authentication("operator")?;
    let (router, control) = prepare_log_generation_recovery_control(
        host,
        Arc::new(proof),
        provider,
        "owner",
        native_token,
        operators,
    )
    .await?;
    Ok((router, control, token))
}
pub async fn generate(
    parent: &Path,
    spec: source::Spec,
    bytes: Option<&[Vec<u8>]>,
    migrated: bool,
    server_packet_assets: bool,
) -> Result<Running> {
    if bytes.is_some_and(|rasters| rasters.len() != 2) {
        return Err("exactly two private seed rasters are required".into());
    }
    Box::pin(generate_selected(parent, spec, bytes.unwrap_or(&[]), migrated, server_packet_assets))
        .await
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
fn capture_source_cuts(
    directory: &Path,
    mut room: breditor_collab_relay::Room,
    mut assets: AssetStore,
    migrated: bool,
) -> Result<migrated_origin::Cuts> {
    room.seal_document_history_generation("owner", "document-two".into())?;
    if !migrated {
        room.rotate_log_generation("owner", "two")?;
    }
    room.seal_review_history_generation("owner", "review-two".into())?;
    if !migrated {
        room.rotate_log_generation("owner", "three")?;
    }
    room.grant("owner", "boundary-reader", Some(Role::Reader))?;
    // All seven current writers stay enabled; the old long-cut fixture is separate.
    if migrated {
        migrated_origin::capture(directory, room, assets)
    } else {
        let older = ServerLogGenerationRoomBackup::capture(&mut room, &mut assets, "owner")?;
        room.grant("owner", "control-local-reader", Some(Role::Reader))?;
        room.rotate_log_generation("owner", "control-local-origin")?;
        let local = ServerLogGenerationRoomBackup::capture(&mut room, &mut assets, "owner")?;
        drop(room);
        drop(assets);
        Ok(migrated_origin::Cuts { older, local, legacy: None })
    }
}
async fn generate_selected(
    parent: &Path,
    spec: source::Spec,
    rasters: &[Vec<u8>],
    migrated: bool,
    server_packet_assets: bool,
) -> Result<Running> {
    let root = parent.join(spec.name());
    storage::directory(&root)?;
    let asset = rasters.first().map(|first| asset_id(first));
    let source::Source { profile, mut room, configuration } = if migrated {
        migrated_origin::create(&root, spec, asset.as_deref())?
    } else {
        source::create(&root, spec, asset.as_deref())?
    };
    let clients::CapturedClients { records, protected, secrets } =
        clients::capture(&mut room, &profile, spec)?;
    if records.as_array().map(Vec::len) != Some(7)
        || protected.documents.len() != 7
        || protected.reviews.len() != 7
    {
        return Err("seven actual image-bearing registrations are required".into());
    }
    let assets = seed_assets(&root, &mut room, rasters)?;
    if server_packet_assets && spec.atomic {
        let raster =
            asset_id(rasters.get(1).ok_or("server packet fixture requires a second raster")?);
        server_packet_asset::publish(&mut room, &profile, &raster, "server-packet-only")?;
        let accepted = server_packet_asset::publish(
            &mut room,
            &profile,
            &raster,
            "server-accepted-after-clients",
        )?;
        server_packet_asset::accept(&mut room, accepted)?;
    }
    let migrated_origin::Cuts { older: ancestor, local, legacy } =
        capture_source_cuts(&root, room, assets, migrated)?;
    let mut operation = ServerLogGenerationRoomRecovery::begin(
        &root.join("restored"),
        &local,
        &local.info()?.identity,
        RoomRecoveryPolicy::HostReacquired,
    )?
    .finish(&local)?
    .begin_operation(
        &local,
        &local.info()?.identity,
        RoomRecoveryPolicy::HostReacquired,
        "owner",
    )?;
    operation.room_mut().grant("owner", "post-origin-reader", Some(Role::Reader))?;
    operation.room_mut().rotate_log_generation("owner", "post-origin-physical-cut")?;
    let (native_auth, native_token) = authentication("owner")?;
    let base = Box::pin(prepare_log_generation_recovery_host(
        operation,
        native_auth,
        ServerLogGenerationRoomBackup::from_owned_bytes(local.to_bytes()?)?,
        &local.info()?.identity,
        "owner",
        &native_token,
    ))
    .await?;
    let host = base;
    let capture = host.capture_recovery_state("owner", &native_token).await?;
    let selected = capture.identity()?;
    if selected.origin == ancestor.info()?.identity
        || selected.origin != local.info()?.identity
        || selected.origin == selected.server
    {
        return Err("actual standalone origin/current fixture".into());
    }
    let (current, inventory) = capture.into_parts();
    let native = super::protected_streams::verify(
        &host,
        &native_token,
        selected.clone(),
        inventory.clone(),
        protected,
    )
    .await?;
    let (router, control, operator_token) = prepare_control(host, native, &native_token).await?;
    let mut fixture = json!({"format":"breditor/native-generation-complete-control-fixture","formatVersion":1,"language":spec.language,"standard":spec.standard,"atomic":spec.atomic,"configuration":configuration,"inventoryJson":serde_json::to_string(&inventory.metadata().native)?,"generationRecoveryState":selected,"clients":records,"registeredWriters":7,"registeredReviewActors":7,"protectedStreams":14});
    if let Some(legacy) = &legacy {
        fixture["legacyMigration"] = serde_json::to_value(&legacy.selection)?;
    }
    let credentials: Vec<_> = secrets
        .iter()
        .map(String::as_str)
        .chain([native_token.as_str(), operator_token.as_str()])
        .collect();
    let path = super::public_inputs::write(&super::public_inputs::PublicInputs {
        directory: &root,
        fixture: &fixture.to_string(),
        inventory: inventory.to_json(),
        origin: &local.to_bytes()?,
        older: &ancestor.to_bytes()?,
        current: &current.to_bytes()?,
        legacy: legacy.as_ref().map(|legacy| super::public_inputs::LegacyFiles {
            archive: &legacy.archive,
            wal: &legacy.wal,
        }),
        credentials: &credentials,
    })?;
    Ok(Running { path, router, control, operator_token })
}

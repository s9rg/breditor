//! Real older A, physically later actual origin B, restored C and all original protected streams.
use super::{Result, clients, source, storage};
use breditor_collab_relay::{
    Role, RoomRecoveryPolicy, ServerLogGenerationRoomBackup, ServerLogGenerationRoomRecovery,
    assets::{AssetStore, asset_id, prepare_asset},
    server::{
        Authentication, ContentAddressedServerAssets, PhysicalRoomRecoveryControl,
        PhysicalServerRecoveryAssetCoverage, PhysicalServerRoomRecoveryCoverage,
        PreparedPhysicalRoomRecoveryHost, VerifiedPhysicalServerRoomRecoveryState,
        prepare_log_generation_recovery_host, prepare_physical_room_recovery_control,
        prepare_physical_room_recovery_host,
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
    pub control: PhysicalRoomRecoveryControl,
    pub operator_token: String,
}
fn authentication(principal: &str) -> Result<(Authentication, String)> {
    let (token, hash) = Authentication::issue_token()?;
    Ok((Authentication::from_json(&json!({"format":"breditor/relay-auth","formatVersion":1,"origins":["http://127.0.0.1:4187"],"accounts":[{"principal":principal,"tokenHash":hash}]}).to_string())?,token))
}
async fn prepare_control(
    host: PreparedPhysicalRoomRecoveryHost,
    native: VerifiedPhysicalServerRoomRecoveryState,
    native_token: &str,
) -> Result<(axum::Router, PhysicalRoomRecoveryControl, String)> {
    let provider: Arc<dyn breditor_collab_relay::server::ServerRecoveryAssetProvider> =
        Arc::new(ContentAddressedServerAssets);
    let PhysicalServerRecoveryAssetCoverage::Verified(proof) = host
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
    let (router, control) = prepare_physical_room_recovery_control(
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
) -> Result<Running> {
    if bytes.is_some_and(|rasters| rasters.len() != 2) {
        return Err("exactly two private seed rasters are required".into());
    }
    Box::pin(generate_selected(parent, spec, bytes.unwrap_or(&[]))).await
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
async fn generate_selected(
    parent: &Path,
    spec: source::Spec,
    rasters: &[Vec<u8>],
) -> Result<Running> {
    let root = parent.join(spec.name());
    storage::directory(&root)?;
    let asset = rasters.first().map(|first| asset_id(first));
    let source::Source { profile, mut room, configuration } =
        source::create(&root, spec, asset.as_deref())?;
    let clients::CapturedClients { records, protected, secrets } =
        clients::capture(&mut room, &profile, spec)?;
    let mut assets = seed_assets(&root, &mut room, rasters)?;
    room.seal_document_history_generation("owner", "document-two".into())?;
    room.rotate_log_generation("owner", "two")?;
    room.seal_review_history_generation("owner", "review-two".into())?;
    room.rotate_log_generation("owner", "three")?;
    room.grant("owner", "boundary-reader", Some(Role::Reader))?;
    let long = spec.language == 3 && spec.standard && spec.atomic;
    if long {
        room.grant("owner", "alice", None)?;
        for index in 0..8200 {
            room.grant(
                "owner",
                "capacity-reader",
                Some(if index % 2 == 0 { Role::Reader } else { Role::Editor }),
            )?;
        }
    }
    let ancestor = ServerLogGenerationRoomBackup::capture(&mut room, &mut assets, "owner")?;
    room.grant("owner", "control-local-reader", Some(Role::Reader))?;
    room.rotate_log_generation("owner", "control-local-origin")?;
    let local = ServerLogGenerationRoomBackup::capture(&mut room, &mut assets, "owner")?;
    drop(room);
    drop(assets);
    let operation = ServerLogGenerationRoomRecovery::begin(
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
    let host = Box::pin(prepare_physical_room_recovery_host(
        base,
        ServerLogGenerationRoomBackup::from_owned_bytes(ancestor.to_bytes()?)?,
        &ancestor.info()?.identity,
        &local.info()?.identity,
        "owner",
        &native_token,
    ))
    .await?;
    let capture = host.capture_recovery_state("owner", &native_token).await?;
    let selected = capture.identity()?;
    if selected.ancestor == selected.local_origin || selected.local_origin != selected.server {
        return Err("actual A/B/C fixture origins".into());
    }
    let (current, inventory) = capture.into_parts();
    let PhysicalServerRoomRecoveryCoverage::Verified(native) = host
        .verify_selected_recovery_state(
            "owner",
            &native_token,
            selected.clone(),
            inventory.clone(),
            protected,
        )
        .await?
    else {
        return Err("native protected streams".into());
    };
    let (router, control, operator_token) = prepare_control(host, native, &native_token).await?;
    let fixture=json!({"format":"breditor/native-physical-recovery-control-fixture","formatVersion":1,"language":spec.language,"standard":spec.standard,"atomic":spec.atomic,"configuration":configuration,"inventoryJson":serde_json::to_string(&inventory.metadata().native)?,"physicalRecoveryState":selected,"clients":records,"longNativeCut":long}).to_string();
    for secret in secrets.iter().chain([&native_token, &operator_token]) {
        if fixture.contains(secret) || inventory.to_json().contains(secret) {
            return Err("private credential entered public fixture".into());
        }
    }
    storage::write_new(&root.join("server.backup"), &ancestor.to_bytes()?)?;
    storage::write_new(&root.join("server-after.backup"), &current.to_bytes()?)?;
    storage::write_new(&root.join("inventory-after.json"), inventory.to_json().as_bytes())?;
    let path = root.join("fixture.json");
    storage::write_new(&path, fixture.as_bytes())?;
    Ok(Running { path, router, control, operator_token })
}

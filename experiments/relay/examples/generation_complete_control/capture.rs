//! Seven actual image-bearing native authors under genuine standalone origin/current custody.
use super::{
    Result, activation, clients, migrated_origin, offload_volume, server_packet_asset, source,
    storage,
};
use breditor_collab_relay::{
    OperationalLogGenerationServerRoom, RecoveryRegistrationCredentials, RelaySegmentBaseFile,
    Role, RoomRecoveryPolicy, ServerLogGenerationBackup, ServerLogGenerationRoomBackup,
    ServerLogGenerationRoomBackupFile, ServerLogGenerationRoomRecovery, ServerNativeHistoryFamily,
    SuggestionRole,
    assets::{AssetStore, asset_id, prepare_asset},
    server::{
        Authentication, ContentAddressedServerAssets, PreparedLogGenerationRecoveryHost,
        ServerLogGenerationRecoveryAssetCoverage, ServerLogGenerationRecoveryControl,
        VerifiedServerLogGenerationRecoveryState, prepare_log_generation_recovery_control,
        prepare_log_generation_recovery_host, prepare_log_generation_recovery_host_file,
    },
};
use serde_json::json;
use std::{
    fs::File,
    path::{Path, PathBuf},
    sync::Arc,
};

pub struct Running {
    pub path: PathBuf,
    pub router: axum::Router,
    pub control: ServerLogGenerationRecoveryControl,
    pub operator_token: String,
    pub activation: Option<activation::Prepared>,
    pub private_delivery: Option<serde_json::Value>,
}
pub(super) fn authentication(principal: &str) -> Result<(Authentication, String)> {
    let (token, hash) = Authentication::issue_token()?;
    Ok((authentication_for_digest(principal, &hash)?, token))
}
pub(super) fn authentication_for_digest(
    principal: &str,
    digest: &[u8; 32],
) -> Result<Authentication> {
    authentication_for_accounts(&json!([{"principal":principal,"tokenHash":digest}]))
}

pub(super) fn authentication_for_accounts(accounts: &serde_json::Value) -> Result<Authentication> {
    Ok(Authentication::from_json(&json!({"format":"breditor/relay-auth","formatVersion":1,"origins":["http://127.0.0.1:4187"],"accounts":accounts}).to_string())?)
}

/// This test-only envelope travels on the private process pipe, outside public evidence.
fn private_delivery(
    account_token: &str,
    protected: &RecoveryRegistrationCredentials,
) -> serde_json::Value {
    let documents: Vec<_> = protected.documents.iter().map(|row|
        json!({"writer":row.writer,"principal":row.principal,"credential":row.credential})).collect();
    let reviews: Vec<_> = protected
        .reviews
        .iter()
        .map(|row| json!({"actor":row.actor,"principal":row.principal,"credential":row.credential}))
        .collect();
    json!({"accountToken":account_token,"documents":documents,"reviews":reviews})
}
async fn prepare_control(
    host: PreparedLogGenerationRecoveryHost,
    native: Arc<VerifiedServerLogGenerationRecoveryState>,
    native_token: &str,
    operator_digest: &[u8; 32],
) -> Result<(axum::Router, ServerLogGenerationRecoveryControl)> {
    let provider: Arc<dyn breditor_collab_relay::server::ServerRecoveryAssetProvider> =
        Arc::new(ContentAddressedServerAssets);
    let ServerLogGenerationRecoveryAssetCoverage::Verified(proof) = host
        .verify_recovery_asset_availability("owner", native_token, native, provider.clone())
        .await?
    else {
        return Err("native server provider".into());
    };
    let operators = authentication_for_digest("operator", operator_digest)?;
    let (router, control) = prepare_log_generation_recovery_control(
        host,
        Arc::new(proof),
        provider,
        "owner",
        native_token,
        operators,
    )
    .await?;
    Ok((router, control))
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
async fn capture_source_cuts(
    directory: &Path,
    mut room: breditor_collab_relay::Room,
    mut assets: AssetStore,
    migrated: bool,
    activation: bool,
) -> Result<(migrated_origin::Cuts, Option<activation::Predecessor>)> {
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
        Ok((migrated_origin::capture(directory, room, assets)?, None))
    } else {
        let mut older_bytes = Vec::new();
        let older_info = ServerLogGenerationRoomBackup::capture_to(
            &mut room,
            &assets,
            "owner",
            &mut older_bytes,
        )?;
        let older = ServerLogGenerationRoomBackup::from_owned_bytes(older_bytes)?;
        if older.info()? != older_info {
            return Err("streamed predecessor backup identity differs".into());
        }
        room.grant("owner", "control-local-reader", Some(Role::Reader))?;
        room.rotate_log_generation("owner", "control-local-origin")?;
        let (local, predecessor) = if activation {
            let checkpoint = room.materialize_relay_checkpoint("owner")?;
            let checkpoint = breditor_collab_relay::RelayCheckpoint::from_bytes(
                checkpoint.bytes().to_vec(),
                checkpoint.identity(),
            )?;
            let source = directory.join("source-native");
            if offload_volume::mount(&source, "source")? {
                drop(room);
                room = breditor_collab_relay::Room::open_log_generations_with_checkpoint(
                    &source,
                    &checkpoint,
                )?;
            }
            if room.archive_sealed_wal("owner", &checkpoint, "root")?.duplicate {
                return Err("source relay archive unexpectedly existed".into());
            }
            // A retained predecessor can end inside a nonempty active WAL.
            room.grant("owner", "base-cut-reader", Some(Role::Reader))?;
            let archive_path = directory.join("relay-segment-base.archive");
            let checkpoint_path = directory.join("relay-segment-base.checkpoint");
            let identity = {
                let mut archive = File::create_new(&archive_path)?;
                let mut state = File::create_new(&checkpoint_path)?;
                let identity = room.write_relay_segment_base("owner", &mut archive, &mut state)?;
                archive.sync_all()?;
                state.sync_all()?;
                identity
            };
            room.grant("owner", "control-local-reader", Some(Role::Reader))?;
            drop(room);
            let base = RelaySegmentBaseFile::open(
                File::open(archive_path)?,
                File::open(checkpoint_path)?,
                &identity,
            )?;
            let room = breditor_collab_relay::Room::open_log_generations_with_segment_base(
                &source, &base,
            )?;
            room.catchup("base-cut-reader")?;
            room.catchup("control-local-reader")?;
            let (backup, predecessor) = Box::pin(activation::seal(directory, room, assets)).await?;
            (backup, Some(predecessor))
        } else {
            (ServerLogGenerationRoomBackup::capture(&mut room, &mut assets, "owner")?, None)
        };
        Ok((migrated_origin::Cuts { older, local, legacy: None }, predecessor))
    }
}
#[expect(
    clippy::too_many_lines,
    reason = "Keep the scenario and its assertions in chronological order"
)]
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
    let activation_case =
        server_packet_assets && spec.atomic && spec.language == 3 && !spec.standard;
    if activation_case {
        room.grant_document_suggestions("owner", "alice", Some(SuggestionRole::Review))?;
    }
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
    let (migrated_origin::Cuts { older: ancestor, local, legacy }, predecessor) =
        Box::pin(capture_source_cuts(&root, room, assets, migrated, activation_case)).await?;
    let (mut operation, disk_origin) = restore_local(&root, &local, activation_case)?;
    let restored_history = operation.room().native_history_descriptor("owner")?;
    let continued_document_receiver =
        restored_history.document == ServerNativeHistoryFamily::ContinuedV2;
    let continued_review_receiver =
        restored_history.review == Some(ServerNativeHistoryFamily::ContinuedV2);
    if continued_document_receiver != activation_case
        || continued_review_receiver != activation_case
    {
        return Err("restored receiver histories differ from the fixture policy".into());
    }
    operation.room_mut().grant("owner", "post-origin-reader", Some(Role::Reader))?;
    operation.room_mut().rotate_log_generation("owner", "post-origin-physical-cut")?;
    if activation_case {
        let packed = operation.room_mut().pack_sealed_wal("owner", "two")?;
        if !packed.packed || packed.stored_bytes >= packed.original_bytes {
            return Err("restored relay did not reclaim sealed WAL bytes".into());
        }
        let checkpoint = operation.room().materialize_relay_checkpoint("owner")?;
        let archived = operation.room_mut().archive_sealed_wal("owner", &checkpoint, "two")?;
        if archived.duplicate || archived.stored_bytes != packed.stored_bytes {
            return Err("restored relay did not archive the selected packed WAL".into());
        }
        check_streamed_backup(&mut operation)?;
    }
    let (native_token, native_digest) = Authentication::issue_token()?;
    let delivery_account = predecessor.is_some().then(Authentication::issue_token).transpose()?;
    let native_auth = match &delivery_account {
        Some((_, digest)) => authentication_for_accounts(&json!([
            {"principal":"owner","tokenHash":native_digest},
            {"principal":"alice","tokenHash":digest}
        ]))?,
        None => authentication_for_digest("owner", &native_digest)?,
    };
    let private_delivery =
        delivery_account.as_ref().map(|(token, _)| private_delivery(token, &protected));
    let origin = local.info()?.identity;
    let host = if let Some(file) = disk_origin {
        Box::pin(prepare_log_generation_recovery_host_file(
            operation,
            native_auth,
            file,
            &origin,
            "owner",
            &native_token,
        ))
        .await?
    } else {
        Box::pin(prepare_log_generation_recovery_host(
            operation,
            native_auth,
            ServerLogGenerationRoomBackup::from_owned_bytes(local.to_bytes()?)?,
            &origin,
            "owner",
            &native_token,
        ))
        .await?
    };
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
    let native = Arc::new(native);
    let (operator_token, operator_digest) = Authentication::issue_token()?;
    let activation = if let Some(predecessor) = predecessor {
        Some(
            activation::prepare(
                &root,
                predecessor,
                host.clone(),
                native.clone(),
                &native_token,
                &operator_digest,
            )
            .await?,
        )
    } else {
        None
    };
    let (router, control) = prepare_control(host, native, &native_token, &operator_digest).await?;
    let mut fixture = json!({"format":"breditor/native-generation-complete-control-fixture","formatVersion":1,"language":spec.language,"standard":spec.standard,"atomic":spec.atomic,"configuration":configuration,"inventoryJson":serde_json::to_string(&inventory.metadata().native)?,"generationRecoveryState":selected,"clients":records,"registeredWriters":7,"registeredReviewActors":7,"protectedStreams":14});
    if let Some(legacy) = &legacy {
        fixture["legacyMigration"] = serde_json::to_value(&legacy.selection)?;
    }
    if continued_document_receiver {
        fixture["continuedDocumentReceiver"] = continued_document_receiver.into();
    }
    let credentials: Vec<_> = secrets
        .iter()
        .map(String::as_str)
        .chain([native_token.as_str(), operator_token.as_str()])
        .chain(delivery_account.iter().map(|(token, _)| token.as_str()))
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
    Ok(Running { path, router, control, operator_token, activation, private_delivery })
}

fn restore_local(
    root: &Path,
    local: &ServerLogGenerationRoomBackup,
    use_disk: bool,
) -> Result<(OperationalLogGenerationServerRoom, Option<ServerLogGenerationRoomBackupFile>)> {
    use std::{
        fs::{File, OpenOptions},
        os::unix::fs::OpenOptionsExt,
    };
    let expected = local.info()?.identity;
    let path = root.join("restored");
    let policy = RoomRecoveryPolicy::HostReacquired;
    if !use_disk {
        let operation = ServerLogGenerationRoomRecovery::begin(&path, local, &expected, policy)?
            .finish(local)?
            .begin_operation(local, &expected, policy, "owner")?;
        return Ok((operation, None));
    }
    let archive = root.join("local-recovery-input.backup");
    let mut output = OpenOptions::new().write(true).create_new(true).mode(0o600).open(&archive)?;
    local.write_to(&mut output)?;
    output.sync_all()?;
    drop(output);
    let file = ServerLogGenerationRoomBackupFile::open(File::open(&archive)?, &expected)?;
    drop(ServerLogGenerationRoomRecovery::begin_file(&path, &file, &expected, policy)?);
    let operation = ServerLogGenerationRoomRecovery::resume_file(&path, &file, &expected, policy)?
        .finish_file(&file)?
        .begin_operation_file(&file, &expected, policy, "owner")?;
    let native = offload_volume::restored_native_root(operation.root())?;
    drop(operation);
    if std::env::var_os("BREDITOR_TEST_ARCHIVE_MOUNT").is_some() {
        offload_volume::mount(&native, "restored")?;
    }
    let operation =
        OperationalLogGenerationServerRoom::resume_file(&path, &file, &expected, policy, "owner")?;
    Ok((operation, Some(file)))
}

fn check_streamed_backup(
    operation: &mut breditor_collab_relay::OperationalLogGenerationServerRoom,
) -> Result {
    let mut bytes = Vec::new();
    let streamed = operation.room_mut().write_log_generation_backup("owner", &mut bytes)?;
    let decoded = ServerLogGenerationBackup::from_owned_bytes(bytes)?;
    let buffered = operation.room_mut().export_log_generation_backup("owner")?;
    if streamed != decoded.info() || streamed != buffered.info() {
        return Err("streamed backup differs at the restored cut".into());
    }
    decoded.check_live(operation.room_mut(), "owner")?;
    let (room, rasters) = operation.components_mut();
    let mut joined = Vec::new();
    let written = ServerLogGenerationRoomBackup::capture_to(room, rasters, "owner", &mut joined)?;
    let archive = ServerLogGenerationRoomBackup::from_owned_bytes(joined)?;
    let buffered = ServerLogGenerationRoomBackup::capture(room, rasters, "owner")?;
    if written != archive.info()? || written != buffered.info()? {
        return Err("streamed joined backup differs at the restored cut".into());
    }
    archive.check_live(room, rasters, "owner")?;
    Ok(())
}

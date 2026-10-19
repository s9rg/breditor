//! Actual private Host capture, original native restore and protected registration verification.
use super::{Result, clients, source, storage};
use breditor_collab_relay::{
    OperationalServerRoom, RecoveryDocumentCredential, RecoveryRegistrationCoverage,
    RecoveryRegistrationCredentials, RecoveryReviewCredential, Role, Room,
    RoomParticipantInventory, RoomParticipantInventoryIdentity, RoomRecoveryPolicy,
    ServerRoomBackup, ServerRoomBackupIdentity, ServerRoomRecovery,
    assets::AssetStore,
    server::{Authentication, ServerRecoveryCoverage, router_with_server_backups},
};
use serde_json::{Value, json};
use std::path::Path;

struct NativeCapture {
    inventory_json: String,
    selected: RoomParticipantInventoryIdentity,
    server_bytes: Vec<u8>,
    account_tokens: [String; 2],
}
fn fresh_authentication() -> Result<(Authentication, String)> {
    let (token, hash) = Authentication::issue_token()?;
    let config=json!({"format":"breditor/relay-auth","formatVersion":1,"origins":["http://127.0.0.1:4187"],"accounts":[{"principal":"owner","tokenHash":hash}]}).to_string();
    Ok((Authentication::from_json(&config)?, token))
}
fn protected_copy(input: &RecoveryRegistrationCredentials) -> RecoveryRegistrationCredentials {
    RecoveryRegistrationCredentials {
        documents: input
            .documents
            .iter()
            .map(|r| RecoveryDocumentCredential {
                principal: r.principal.clone(),
                writer: r.writer.clone(),
                credential: r.credential.clone(),
            })
            .collect(),
        reviews: input
            .reviews
            .iter()
            .map(|r| RecoveryReviewCredential {
                principal: r.principal.clone(),
                actor: r.actor.clone(),
                credential: r.credential.clone(),
            })
            .collect(),
    }
}
fn reopen_operation(
    directory: &Path,
    backup: &ServerRoomBackup,
    expected: &ServerRoomBackupIdentity,
) -> Result {
    let destination = directory.join("restored");
    let operation = OperationalServerRoom::resume(
        &destination,
        backup,
        expected,
        RoomRecoveryPolicy::HostReacquired,
    )?;
    let (mut authority, mut assets) = operation.into_parts();
    authority.grant("owner", "after.operation", Some(Role::Reader))?;
    let before = ServerRoomBackup::capture(&mut authority, &mut assets)?.to_bytes()?;
    drop(authority);
    drop(assets);
    let operation = OperationalServerRoom::resume(
        &destination,
        backup,
        expected,
        RoomRecoveryPolicy::HostReacquired,
    )?;
    if operation.origin() != *expected {
        return Err("operational origin changed".into());
    }
    let (mut authority, mut assets) = operation.into_parts();
    authority.catchup("after.operation")?;
    if ServerRoomBackup::capture(&mut authority, &mut assets)?.to_bytes()? != before {
        return Err("operational current cut changed across reopen".into());
    }
    Ok(())
}
async fn capture_and_verify(
    directory: &Path,
    room: Room,
    protected: RecoveryRegistrationCredentials,
) -> Result<NativeCapture> {
    let assets = AssetStore::open(&directory.join("source-assets"), room.asset_binding())?;
    let (authentication, old_token) = fresh_authentication()?;
    let (router, handle) = router_with_server_backups(room, authentication, assets)?;
    let captured = handle.capture_recovery_state("owner", &old_token).await?;
    let selected = captured.identity();
    let (server, inventory) = captured.into_parts();
    let server_bytes = server.to_bytes()?;
    let inventory_json = inventory.to_json().to_owned();
    drop(handle);
    drop(router);
    let admitted = ServerRoomBackup::from_bytes(&server_bytes)?;
    let (room, assets) = ServerRoomRecovery::begin(
        &directory.join("restored"),
        &admitted,
        &selected.server,
        RoomRecoveryPolicy::HostReacquired,
    )?
    .finish(&admitted)?
    .begin_operation(&admitted, &selected.server, RoomRecoveryPolicy::HostReacquired)?
    .into_parts();
    let (authentication, token) = fresh_authentication()?;
    let (restored_router, handle) = router_with_server_backups(room, authentication, assets)?;
    if handle.capture_recovery_state("owner", &old_token).await.is_ok() {
        return Err("old account authentication survived".into());
    }
    if handle.capture_recovery_state("owner", &token).await?.identity() != selected {
        return Err("native capture changed across restore".into());
    }
    let current_inventory =
        || RoomParticipantInventory::from_json(&inventory_json, &selected.participants);
    let ServerRecoveryCoverage::Pending { missing } = handle
        .verify_selected_recovery_state(
            "owner",
            &token,
            selected.clone(),
            current_inventory()?,
            RecoveryRegistrationCredentials::default(),
        )
        .await?
    else {
        return Err("missing original records created a combined native proof".into());
    };
    if missing.is_empty() {
        return Err("fixture must retain registered clients".into());
    }
    let ServerRecoveryCoverage::Verified(selected_proof) = handle
        .verify_selected_recovery_state(
            "owner",
            &token,
            selected.clone(),
            current_inventory()?,
            protected_copy(&protected),
        )
        .await?
    else {
        return Err("combined native original cut not verified".into());
    };
    if selected_proof.identity() != selected {
        return Err("combined native proof cut changed".into());
    }
    selected_proof.check_live(&handle, "owner", &token).await?;
    let verified =
        handle.verify_recovery_registrations("owner", &token, inventory, protected).await?;
    let RecoveryRegistrationCoverage::Verified(proof) = verified else {
        return Err("protected native registrations not complete".into());
    };
    if proof.identity() != selected.participants {
        return Err("native proof cut changed".into());
    }
    drop(handle);
    drop(restored_router);
    reopen_operation(directory, &admitted, &selected.server)?;
    Ok(NativeCapture {
        inventory_json,
        selected: selected.participants,
        server_bytes,
        account_tokens: [old_token, token],
    })
}
pub async fn generate(parent: &Path, spec: source::Spec) -> Result<Value> {
    let root = parent.join(spec.name());
    storage::directory(&root)?;
    let source::Source { profile, mut room, configuration } = source::create(&root, spec)?;
    let clients::CapturedClients { records, protected, secrets } =
        clients::capture(&mut room, &profile, spec)?;
    if spec.language == 3 && spec.standard && spec.atomic {
        room.grant("owner", "alice", None)?;
    }
    let NativeCapture { inventory_json, selected, server_bytes, account_tokens } =
        capture_and_verify(&root, room, protected).await?;
    let file=json!({"format":"breditor/native-participant-inventory-fixture","formatVersion":1,"language":spec.language,"standard":spec.standard,"atomic":spec.atomic,"configuration":configuration,"inventoryJson":inventory_json,"selected":selected,"clients":records}).to_string();
    for secret in secrets.iter().chain(account_tokens.iter()) {
        if file.contains(secret) {
            return Err("raw native credential entered public fixture".into());
        }
    }
    storage::write_new(&root.join("inventory.json"), inventory_json.as_bytes())?;
    storage::write_new(&root.join("server.backup"), &server_bytes)?;
    storage::write_new(&root.join("fixture.json"), file.as_bytes())?;
    Ok(
        json!({"path":root.join("fixture.json"),"nativeOwnerAuthenticated":true,"nativeRestoredRegistrationsVerified":true,"nativeSelectedServerStateVerified":true,"nativeOperationalReopensVerified":true,"rawCredentialsExported":false}),
    )
}

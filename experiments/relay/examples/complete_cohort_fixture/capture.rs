//! Actual restore, owner authentication and all protected streams before SDK fixture publication.
use super::{Result, clients, source, storage};
use breditor_collab_relay::{
    OperationalLogGenerationServerRoom, RecoveryDocumentCredential,
    RecoveryRegistrationCredentials, RecoveryReviewCredential, Role, Room, RoomRecoveryPolicy,
    ServerLogGenerationParticipantInventory, ServerLogGenerationRoomBackup,
    ServerLogGenerationRoomRecovery,
    assets::AssetStore,
    server::{
        Authentication, PreparedLogGenerationRecoveryHost, ServerLogGenerationRecoveryCoverage,
        ServerLogGenerationRecoveryState, prepare_log_generation_recovery_host,
    },
};
use serde_json::{Value, json};
use std::path::Path;
fn authentication() -> Result<(Authentication, String)> {
    let (token, hash) = Authentication::issue_token()?;
    Ok((Authentication::from_json(&json!({"format":"breditor/relay-auth","formatVersion":1,"origins":["http://127.0.0.1:4187"],"accounts":[{"principal":"owner","tokenHash":hash}]}).to_string())?,token))
}
fn protected_copy(input: &RecoveryRegistrationCredentials) -> RecoveryRegistrationCredentials {
    RecoveryRegistrationCredentials {
        documents: input
            .documents
            .iter()
            .map(|row| RecoveryDocumentCredential {
                principal: row.principal.clone(),
                writer: row.writer.clone(),
                credential: row.credential.clone(),
            })
            .collect(),
        reviews: input
            .reviews
            .iter()
            .map(|row| RecoveryReviewCredential {
                principal: row.principal.clone(),
                actor: row.actor.clone(),
                credential: row.credential.clone(),
            })
            .collect(),
    }
}
async fn verified_state(
    host: &PreparedLogGenerationRecoveryHost,
    token: &str,
    protected: &RecoveryRegistrationCredentials,
) -> Result<ServerLogGenerationRecoveryState> {
    let state = host.capture_recovery_state("owner", token).await?;
    let identity = state.identity()?;
    let (_, inventory) = host.capture_recovery_state("owner", token).await?.into_parts();
    let ServerLogGenerationRecoveryCoverage::Pending { missing } = host
        .verify_selected_recovery_state(
            "owner",
            token,
            identity.clone(),
            inventory.clone(),
            RecoveryRegistrationCredentials::default(),
        )
        .await?
    else {
        return Err("missing physical protected streams produced proof".into());
    };
    if missing.len() != 14 {
        return Err("all native document/review protected streams must be required".into());
    }
    let ServerLogGenerationRecoveryCoverage::Verified(proof) = host
        .verify_selected_recovery_state(
            "owner",
            token,
            identity.clone(),
            inventory,
            protected_copy(protected),
        )
        .await?
    else {
        return Err("complete actual physical streams not verified".into());
    };
    proof.check_live(host, "owner", token).await?;
    if host.capture_asset_recovery_state("owner", token).await?.current != identity {
        return Err("complete native dependency source changed".into());
    }
    Ok(state)
}
fn capture_original(
    room: &mut Room,
    assets: &mut AssetStore,
    long: bool,
) -> Result<ServerLogGenerationRoomBackup> {
    room.seal_document_history_generation("owner", "document-two".into())?;
    room.rotate_log_generation("owner", "two")?;
    room.seal_review_history_generation("owner", "review-two".into())?;
    room.rotate_log_generation("owner", "three")?;
    // Native physical rotation seals a nonempty active WAL. This event belongs
    // to the original cut; the later rotation changes no native event/counter.
    room.grant("owner", "post-boundary-reader", Some(Role::Reader))?;
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
    let original = ServerLogGenerationRoomBackup::capture(room, assets, "owner")?;
    let expected = original.info()?.identity;
    if long && expected.native.source.records <= 8192 {
        return Err("long physical native cut not reached".into());
    }
    Ok(original)
}
fn require_seven_registrations(
    inventory: &ServerLogGenerationParticipantInventory,
    records: &Value,
) -> Result {
    let declared = inventory.metadata();
    if declared.native.writers.len() != 7
        || declared.native.review.as_ref().map(|review| review.writers.len()) != Some(7)
        || records.as_array().map(Vec::len) != Some(7)
    {
        return Err("seven real document and comment registrations are required".into());
    }
    Ok(())
}

pub async fn generate(parent: &Path, spec: source::Spec) -> Result<Value> {
    let root = parent.join(spec.name());
    storage::directory(&root)?;
    let source::Source { profile, mut room, configuration } = source::create(&root, spec, None)?;
    let clients::CapturedClients { records, protected, secrets } =
        clients::capture(&mut room, &profile, spec)?;
    // This distinct fixture keeps every current author enabled. The old
    // two-writer long-cut fixture remains unchanged and independently required.
    let long = false;
    let mut assets = AssetStore::open(&root.join("source-rasters"), room.asset_binding())?;
    let original = capture_original(&mut room, &mut assets, long)?;
    let expected = original.info()?.identity;
    drop(room);
    drop(assets);
    let recovered = ServerLogGenerationRoomRecovery::begin(
        &root.join("restored"),
        &original,
        &expected,
        RoomRecoveryPolicy::HostReacquired,
    )?
    .finish(&original)?
    .begin_operation(&original, &expected, RoomRecoveryPolicy::HostReacquired, "owner")?;
    let (auth, token) = authentication()?;
    let host = Box::pin(prepare_log_generation_recovery_host(
        recovered,
        auth,
        ServerLogGenerationRoomBackup::from_owned_bytes(original.to_bytes()?)?,
        &expected,
        "owner",
        &token,
    ))
    .await?;
    let before = verified_state(&host, &token, &protected).await?;
    let before_identity = before.identity()?;
    let (before_server, before_inventory) = before.into_parts();
    let declaration = serde_json::to_string(&before_inventory.metadata().native)?;
    require_seven_registrations(&before_inventory, &records)?;
    drop(host);
    let mut operation = OperationalLogGenerationServerRoom::resume(
        &root.join("restored"),
        &original,
        &expected,
        RoomRecoveryPolicy::HostReacquired,
        "owner",
    )?;
    operation.room_mut().rotate_log_generation("owner", "physical-only")?;
    let (auth, second_token) = authentication()?;
    let host = Box::pin(prepare_log_generation_recovery_host(
        operation,
        auth,
        ServerLogGenerationRoomBackup::from_owned_bytes(original.to_bytes()?)?,
        &expected,
        "owner",
        &second_token,
    ))
    .await?;
    if host.capture_recovery_state("owner", &token).await.is_ok() {
        return Err("former account token admitted by fresh host".into());
    }
    let after = verified_state(&host, &second_token, &protected).await?;
    let after_identity = after.identity()?;
    if before_identity.origin != after_identity.origin
        || before_identity.server.native.source != after_identity.server.native.source
        || before_identity.server.native.manifest == after_identity.server.native.manifest
        || before_identity.server.native.archive_sha256
            == after_identity.server.native.archive_sha256
    {
        return Err("physical-only cut lost complete original/current pin".into());
    }
    if host
        .verify_selected_recovery_state(
            "owner",
            &second_token,
            before_identity.clone(),
            before_inventory.clone(),
            protected_copy(&protected),
        )
        .await
        .is_ok()
    {
        return Err("old physical source admitted by current native host".into());
    }
    let (after_server, after_inventory) = after.into_parts();
    let file=json!({"format":"breditor/native-complete-cohort-fixture","formatVersion":1,"language":spec.language,"standard":spec.standard,"atomic":spec.atomic,"configuration":configuration,"inventoryJson":declaration,"selected":before_inventory.identity(),"afterSelected":after_inventory.identity(),"recoveryState":before_identity,"afterRecoveryState":after_identity,"clients":records,"longNativeCut":long}).to_string();
    for secret in secrets.iter().chain([&token, &second_token]) {
        if file.contains(secret)
            || before_inventory.to_json().contains(secret)
            || after_inventory.to_json().contains(secret)
        {
            return Err("raw native credential entered fixture".into());
        }
    }
    storage::write_new(&root.join("inventory.json"), before_inventory.to_json().as_bytes())?;
    storage::write_new(&root.join("inventory-after.json"), after_inventory.to_json().as_bytes())?;
    storage::write_new(&root.join("server.backup"), &before_server.to_bytes()?)?;
    storage::write_new(&root.join("server-after.backup"), &after_server.to_bytes()?)?;
    storage::write_new(&root.join("fixture.json"), file.as_bytes())?;
    Ok(
        json!({"path":root.join("fixture.json"),"nativeOwnerAuthenticated":true,"nativeProtectedStreamsVerified":true,"nativeColdOperationalReopenVerified":true,"nativePhysicalOnlyStalenessVerified":true,"rawCredentialsExported":false,"longNativeCut":long}),
    )
}

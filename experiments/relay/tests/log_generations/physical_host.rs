//! Public Rust consumer keeps old local-origin semantics across the distinct ancestor host API.
use super::{TestResult, insert, send, setup};
use breditor_collab_feasibility::review::ReviewActorId;
use breditor_collab_relay::{
    OperationalLogGenerationServerRoom, RecoveryDocumentCredential,
    RecoveryRegistrationCredentials, RecoveryReviewCredential, RoomRecoveryPolicy,
    ServerLogGenerationRoomBackup, ServerLogGenerationRoomRecovery,
    assets::AssetStore,
    server::{
        Authentication, PhysicalServerRoomRecoveryCoverage, PreparedPhysicalRoomRecoveryHost,
        prepare_log_generation_recovery_host, prepare_physical_room_recovery_host,
    },
};

async fn verify_public_state(
    host: &PreparedPhysicalRoomRecoveryHost,
    token: &str,
    ancestor: &ServerLogGenerationRoomBackup,
    local: &ServerLogGenerationRoomBackup,
    credentials: RecoveryRegistrationCredentials,
) -> TestResult {
    let captured = host.capture_recovery_state("owner", token).await?;
    let expected = captured.identity()?;
    assert_eq!(expected.format, "breditor/physical-server-room-recovery-state");
    assert_eq!(expected.ancestor, ancestor.info()?.identity);
    assert_eq!(expected.local_origin, local.info()?.identity);
    assert_eq!(expected.server, local.info()?.identity);
    assert_ne!(expected.ancestor, expected.local_origin);
    let (_, inventory) = captured.into_parts();
    let PhysicalServerRoomRecoveryCoverage::Pending { missing } = host
        .verify_selected_recovery_state(
            "owner",
            token,
            expected.clone(),
            inventory.clone(),
            RecoveryRegistrationCredentials::default(),
        )
        .await?
    else {
        return Err("public missing credentials produced proof".into());
    };
    assert_eq!(missing.len(), 2);
    let PhysicalServerRoomRecoveryCoverage::Verified(proof) = host
        .verify_selected_recovery_state("owner", token, expected.clone(), inventory, credentials)
        .await?
    else {
        return Err("public complete credentials did not verify".into());
    };
    proof.check_live(host, "owner", token).await?;
    let assets = host.capture_asset_recovery_state("owner", token).await?;
    assert_eq!(assets.current, expected);
    assert_eq!(assets.references.source, expected.server.native);
    Ok(())
}

pub(super) async fn prepare_public_host(
    operation: OperationalLogGenerationServerRoom,
    ancestor: &ServerLogGenerationRoomBackup,
    local: &ServerLogGenerationRoomBackup,
) -> TestResult<(PreparedPhysicalRoomRecoveryHost, String)> {
    let (token, hash) = Authentication::issue_token()?;
    let auth = Authentication::from_json(
        &serde_json::json!({"format":"breditor/relay-auth","formatVersion":1,
        "origins":["http://127.0.0.1:4187"],"accounts":[{"principal":"owner","tokenHash":hash}]})
        .to_string(),
    )?;
    let old = Box::pin(prepare_log_generation_recovery_host(
        operation,
        auth,
        ServerLogGenerationRoomBackup::from_owned_bytes(local.to_bytes()?)?,
        &local.info()?.identity,
        "owner",
        &token,
    ))
    .await?;
    let host = Box::pin(prepare_physical_room_recovery_host(
        old.clone(),
        ServerLogGenerationRoomBackup::from_owned_bytes(ancestor.to_bytes()?)?,
        &ancestor.info()?.identity,
        &local.info()?.identity,
        "owner",
        &token,
    ))
    .await?;
    assert_eq!(
        old.capture_recovery_state("owner", &token).await?.identity()?.origin,
        local.info()?.identity
    );
    Ok((host, token))
}

async fn workflow(version: u32, standard: bool, atomic: bool) -> TestResult {
    let (files, profile, mut room) = setup(version, standard, atomic)?;
    room.enable_review("owner")?;
    room.enable_document_history_generations("owner", "root".into(), "one".into())?;
    room.enable_review_history_generations("owner", "root".into(), "one".into())?;
    let author = room.register("owner")?;
    let reviewer = room.register_review("owner", ReviewActorId::try_new("owner.comments")?)?;
    let mut client =
        profile.join_frame("room".into(), author.lease.writer.clone(), &room.catchup("owner")?)?;
    insert(&mut client, "Accepted ")?;
    let mut through = send(&mut room, &client, "owner", &author.lease, "0", atomic)?;
    insert(&mut client, "Old offline ")?;
    let offline = client.checkpoint()?;
    let mut assets = AssetStore::open(&files.0.join("physical-rasters"), room.asset_binding())?;
    let ancestor = ServerLogGenerationRoomBackup::capture(&mut room, &mut assets, "owner")?;
    room.grant("owner", "reader", Some(breditor_collab_relay::Role::Reader))?;
    room.rotate_log_generation("owner", "local-origin")?;
    let local = ServerLogGenerationRoomBackup::capture(&mut room, &mut assets, "owner")?;
    drop(room);
    drop(assets);
    let destination = files.0.join("physical-host");
    let operation = ServerLogGenerationRoomRecovery::begin(
        &destination,
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
    let (host, token) = Box::pin(prepare_public_host(operation, &ancestor, &local)).await?;
    verify_public_state(
        &host,
        &token,
        &ancestor,
        &local,
        RecoveryRegistrationCredentials {
            documents: vec![RecoveryDocumentCredential {
                principal: "owner".into(),
                writer: author.lease.writer.clone(),
                credential: author.credential.clone(),
            }],
            reviews: vec![RecoveryReviewCredential {
                principal: "owner".into(),
                actor: reviewer.lease.actor.as_str().into(),
                credential: reviewer.credential,
            }],
        },
    )
    .await?;
    drop(host);
    assert!(
        OperationalLogGenerationServerRoom::resume(
            &destination,
            &ancestor,
            &ancestor.info()?.identity,
            RoomRecoveryPolicy::HostReacquired,
            "owner"
        )
        .is_err()
    );
    let mut operation = OperationalLogGenerationServerRoom::resume(
        &destination,
        &local,
        &local.info()?.identity,
        RoomRecoveryPolicy::HostReacquired,
        "owner",
    )?;
    let room = operation.room_mut();
    let lease = room.resume("owner", &author.lease.writer, &author.credential)?;
    client = profile.restore("room", &offline)?;
    client.receive_frame(&room.catchup("owner")?)?;
    through = send(room, &client, "owner", &lease, &through, atomic)?;
    for redo in [false, true] {
        assert!(if redo { client.redo()? } else { client.undo()? });
        through = send(room, &client, "owner", &lease, &through, atomic)?;
        assert_eq!(client.document_json().contains("Old offline "), redo);
        assert!(client.document_json().contains("Accepted "));
    }
    operation.check_live_source(&local, "owner")?;
    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn public_physical_hosts_keep_real_local_origin_and_offline_history_in_ten_modes()
-> TestResult {
    for (version, standard) in [(1, false), (2, false), (2, true), (3, false), (3, true)] {
        for atomic in [false, true] {
            Box::pin(workflow(version, standard, atomic)).await?;
        }
    }
    Ok(())
}

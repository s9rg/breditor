//! Public-only compiled consumer of authenticated prepared hosts; no relay-private ownership API.
use super::{TestResult, insert, send, setup};
use breditor_collab_feasibility::{
    review::ReviewActorId,
    rich_replica::{Command, actions::ReplaceImage},
};
use breditor_collab_relay::{
    OperationalLogGenerationServerRoom, RecoveryDocumentCredential,
    RecoveryRegistrationCredentials, RecoveryReviewCredential, Role, RoomRecoveryPolicy,
    ServerLogGenerationRoomBackup, ServerLogGenerationRoomRecovery,
    assets::{AssetStore, asset_id, prepare_asset},
    server::{
        Authentication, PreparedLogGenerationRecoveryHost, ServerLogGenerationRecoveryCoverage,
        prepare_log_generation_recovery_host,
    },
};
use std::io::Cursor;
fn authentication() -> TestResult<(Authentication, String)> {
    let (token, hash) = Authentication::issue_token()?;
    let config = serde_json::json!({"format":"breditor/relay-auth","formatVersion":1,
        "origins":["http://127.0.0.1:4187"],"accounts":[{"principal":"owner","tokenHash":hash}]})
    .to_string();
    Ok((Authentication::from_json(&config)?, token))
}
async fn complete_proof(
    handle: &PreparedLogGenerationRecoveryHost,
    token: &str,
    credentials: RecoveryRegistrationCredentials,
) -> TestResult {
    let state = handle.capture_recovery_state("owner", token).await?;
    let expected = state.identity()?;
    let (server, inventory) = state.into_parts();
    assert_eq!(server.info()?.identity, expected.server);
    assert_eq!(inventory.identity().source, expected.server.native);
    let ServerLogGenerationRecoveryCoverage::Verified(proof) = handle
        .verify_selected_recovery_state("owner", token, expected.clone(), inventory, credentials)
        .await?
    else {
        return Err("public protected input missing".into());
    };
    proof.check_live(handle, "owner", token).await?;
    assert_eq!(handle.capture_asset_recovery_state("owner", token).await?.current, expected);
    Ok(())
}
async fn workflow(version: u32, standard: bool, atomic: bool) -> TestResult {
    let (files, profile, mut room) = setup(version, standard, atomic)?;
    room.enable_review("owner")?;
    room.enable_document_history_generations("owner", "root".into(), "one".into())?;
    room.enable_review_history_generations("owner", "root".into(), "one".into())?;
    room.grant("owner", "reader", Some(Role::Reader))?;
    let author = room.register("owner")?;
    let observer = room.register_observer("reader")?;
    let reviewer = room.register_review("owner", ReviewActorId::try_new("owner.comments")?)?;
    let mut assets = AssetStore::open(&files.0.join("prepared-assets"), room.asset_binding())?;
    let mut png = Cursor::new(Vec::new());
    image::DynamicImage::new_rgb8(3, 4).write_to(&mut png, image::ImageFormat::Png)?;
    let png = png.into_inner();
    let asset = asset_id(&png);
    room.put_asset("owner", &mut assets, prepare_asset(&asset, "image/png", png.clone())?)?;
    let mut client =
        profile.join_frame("room".into(), author.lease.writer.clone(), &room.catchup("owner")?)?;
    client.apply(vec![Command::ReplaceImage(ReplaceImage {
        block: "image-block".into(),
        asset: asset.clone(),
        generation: "retained".into(),
    })])?;
    insert(&mut client, "Accepted ")?;
    let mut through = send(&mut room, &client, "owner", &author.lease, "0", atomic)?;
    insert(&mut client, "Old offline ")?;
    let saved = client.checkpoint()?;
    let original = ServerLogGenerationRoomBackup::capture(&mut room, &mut assets, "owner")?;
    let selected = original.info()?.identity;
    drop(room);
    drop(assets);
    let destination = files.0.join("prepared");
    let operational = ServerLogGenerationRoomRecovery::begin(
        &destination,
        &original,
        &selected,
        RoomRecoveryPolicy::HostReacquired,
    )?
    .finish(&original)?
    .begin_operation(&original, &selected, RoomRecoveryPolicy::HostReacquired, "owner")?;
    let (auth, token) = authentication()?;
    let handle = Box::pin(prepare_log_generation_recovery_host(
        operational,
        auth,
        ServerLogGenerationRoomBackup::from_owned_bytes(original.to_bytes()?)?,
        &selected,
        "owner",
        &token,
    ))
    .await?;
    complete_proof(&handle, &token, protected_records(&author, &observer, &reviewer)).await?;
    let copy = handle.clone();
    drop(handle);
    assert!(
        OperationalLogGenerationServerRoom::resume(
            &destination,
            &original,
            &selected,
            RoomRecoveryPolicy::HostReacquired,
            "owner"
        )
        .is_err()
    );
    drop(copy);
    let mut current = OperationalLogGenerationServerRoom::resume(
        &destination,
        &original,
        &selected,
        RoomRecoveryPolicy::HostReacquired,
        "owner",
    )?;
    let (room, assets) = current.components_mut();
    assert_eq!(room.read_asset("owner", assets, &asset)?.ok_or("original raster")?.bytes, png);
    let peer = room.register("owner")?;
    let mut remote =
        profile.join_frame("room".into(), peer.lease.writer.clone(), &room.catchup("owner")?)?;
    insert(&mut remote, "Peer preserved ")?;
    send(room, &remote, "owner", &peer.lease, "0", atomic)?;
    let lease = room.resume("owner", &author.lease.writer, &author.credential)?;
    client = profile.restore("room", &saved)?;
    client.receive_frame(&room.catchup("owner")?)?;
    through = send(room, &client, "owner", &lease, &through, atomic)?;
    for redo in [false, true] {
        assert!(if redo { client.redo()? } else { client.undo()? });
        through = send(room, &client, "owner", &lease, &through, atomic)?;
        assert!(client.document_json().contains("Peer preserved "));
        assert_eq!(client.document_json().contains("Old offline "), redo);
        assert!(client.document_json().contains(&asset));
    }
    current.check_live_source(&original, "owner")?;
    Ok(())
}
fn protected_records(
    author: &breditor_collab_relay::Registration,
    observer: &breditor_collab_relay::Registration,
    reviewer: &breditor_collab_relay::ReviewRegistration,
) -> RecoveryRegistrationCredentials {
    RecoveryRegistrationCredentials {
        documents: vec![
            RecoveryDocumentCredential {
                principal: "owner".into(),
                writer: author.lease.writer.clone(),
                credential: author.credential.clone(),
            },
            RecoveryDocumentCredential {
                principal: "reader".into(),
                writer: observer.lease.writer.clone(),
                credential: observer.credential.clone(),
            },
        ],
        reviews: vec![RecoveryReviewCredential {
            principal: "owner".into(),
            actor: reviewer.lease.actor.as_str().into(),
            credential: reviewer.credential.clone(),
        }],
    }
}
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn public_prepared_hosts_keep_native_assets_original_credentials_and_offline_peer_undo_in_ten_modes()
-> TestResult {
    for (version, standard) in [(1, false), (2, false), (2, true), (3, false), (3, true)] {
        for atomic in [false, true] {
            Box::pin(workflow(version, standard, atomic)).await?;
        }
    }
    Ok(())
}
pub(super) fn maximum_host(
    operational: OperationalLogGenerationServerRoom,
    original: &ServerLogGenerationRoomBackup,
) -> TestResult {
    tokio::runtime::Builder::new_multi_thread().worker_threads(2).enable_all().build()?.block_on(
        async {
            let (auth, token) = authentication()?;
            let handle = Box::pin(prepare_log_generation_recovery_host(
                operational,
                auth,
                ServerLogGenerationRoomBackup::from_owned_bytes(original.to_bytes()?)?,
                &original.info()?.identity,
                "owner",
                &token,
            ))
            .await?;
            complete_proof(&handle, &token, RecoveryRegistrationCredentials::default()).await?;
            Ok(())
        },
    )
}

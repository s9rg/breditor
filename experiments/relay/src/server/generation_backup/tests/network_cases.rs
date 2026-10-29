//! Real socket acceptance, stale selection, offline retry and late raster fencing.
use super::{
    fixture::{Directory, TestResult, authentication, source},
    network::{Network, Socket},
};
use crate::{
    Admission, Error, RoomRecoveryPolicy, ServerLogGenerationRoomRecovery,
    assets::{AssetStore, asset_id},
    server::{
        Authentication, LogGenerationServerBackupHandle, RoomDeploymentAuthority,
        SealedLogGenerationHandover, router_with_log_generation_backups_and_deployment_lease,
    },
};
use breditor_collab_feasibility::rich_replica::{Command, RichReplica, actions::InsertText};
use serde_json::{Value, json};
use std::{fs, io::Cursor, time::Duration};

async fn seal(
    handle: &LogGenerationServerBackupHandle,
    token: &str,
    selected: &crate::ServerLogGenerationRoomBackupIdentity,
) -> TestResult<SealedLogGenerationHandover> {
    let deadline = tokio::time::Instant::now() + Duration::from_secs(5);
    loop {
        match handle.seal_for_handover("owner", token, selected.clone()).await {
            Ok(value) => return Ok(value),
            Err(Error::Locked) if tokio::time::Instant::now() < deadline => {
                tokio::time::sleep(Duration::from_millis(2)).await;
            }
            Err(error) => return Err(error.into()),
        }
    }
}
async fn stale(
    handle: &LogGenerationServerBackupHandle,
    token: &str,
    selected: &crate::ServerLogGenerationRoomBackupIdentity,
) -> TestResult {
    let deadline = tokio::time::Instant::now() + Duration::from_secs(5);
    loop {
        match handle.seal_for_handover("owner", token, selected.clone()).await {
            Err(Error::Contract("generation handover source cut changed")) => return Ok(()),
            Err(Error::Locked) if tokio::time::Instant::now() < deadline => {
                tokio::time::sleep(Duration::from_millis(2)).await;
            }
            _ => return Err("stale actual generation source did not refuse".into()),
        }
    }
}

/// Retry the exact retained frame without allocating a second accepted sequence.
fn assert_exact_offline_retry(
    room: &mut crate::Room,
    writer: &crate::Lease,
    frame: &str,
) -> TestResult {
    let Admission::Durable(accepted) = room.admit("owner", writer, frame)? else {
        return Err("offline input was not durably admitted".into());
    };
    assert!(!accepted.duplicate);
    let Admission::Durable(duplicate) = room.admit("owner", writer, frame)? else {
        return Err("exact retry refused".into());
    };
    assert!(duplicate.duplicate);
    assert_eq!(duplicate.sequence, accepted.sequence);
    Ok(())
}

/// Export the real client's retained author history in its selected transport.
fn native_frames(client: &RichReplica, atomic: bool, after: &str) -> TestResult<Value> {
    let encoded = if atomic {
        client.writer_groups_v2_guarded(&client.observe()?, after)?
    } else {
        client.writer_groups_guarded(&client.observe()?, after)?
    };
    Ok(serde_json::from_str(&encoded)?)
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn all_ten_real_generation_sockets_fence_old_writes_keep_offline_retry_and_future_undo()
-> TestResult {
    for (version, standard) in [(1, false), (2, false), (2, true), (3, false), (3, true)] {
        for atomic in [false, true] {
            let d = Directory::new()?;
            let (mut room, profile) = source(&d, version, standard, atomic, true)?;
            let registration = room.register("owner")?;
            let mut client = profile.join_frame(
                "room".into(),
                registration.lease.writer.clone(),
                &room.catchup("owner")?,
            )?;
            let assets = AssetStore::open(&d.0.join("assets"), room.asset_binding())?;
            let authority =
                RoomDeploymentAuthority::create(&d.authority(), &room.deployment_binding()?)?;
            let lease = authority.claim(&authority.current_selection()?)?;
            let (token, _) = Authentication::issue_token()?;
            let (reader, _) = Authentication::issue_token()?;
            let (router, handle) = router_with_log_generation_backups_and_deployment_lease(
                room,
                authentication(&token, &reader)?,
                assets,
                lease,
                "owner",
                &token,
            )
            .await?;
            let network = Network::start(router).await?;
            let mut socket = Socket::connect(network.address).await?;
            assert_eq!(socket.request(json!({"kind":"authenticate","principal":"owner","token":token,"capabilities":if atomic{vec!["writerTransportV2"]}else{vec![]}})).await?["kind"],"authenticated");
            assert_eq!(socket.request(json!({"kind":"resume","writer":registration.lease.writer,"credential":registration.credential})).await?["kind"],"resumed");
            let old = handle.capture("owner", &token).await?;
            client.apply(vec![Command::InsertText(InsertText {
                block: "p".into(),
                offset: 0,
                text: "accepted before source handover 🙂".into(),
            })])?;
            let first = native_frames(&client, atomic, "0")?;
            for frame in first["groups"].as_array().ok_or("first groups")? {
                assert_eq!(
                    socket.request(json!({"kind":"submit","group":frame})).await?["kind"],
                    "durable"
                );
            }
            let current = handle.capture("owner", &token).await?;
            let ledger = fs::read(d.authority().join("authority.log"))?;
            stale(&handle, &token, &old.info()?.identity).await?;
            assert_eq!(fs::read(d.authority().join("authority.log"))?, ledger);
            client.apply(vec![Command::InsertText(InsertText {
                block: "p".into(),
                offset: 0,
                text: "offline pending ".into(),
            })])?;
            let after = first["through"].as_str().ok_or("first through")?;
            let offline = native_frames(&client, atomic, after)?;
            let frame = offline["groups"][0].as_str().ok_or("offline frame")?;
            let checkpoint = client.checkpoint()?;
            let sealed = seal(&handle, &token, &current.info()?.identity).await?;
            assert_eq!(sealed.backup().to_bytes()?, current.to_bytes()?);
            assert_eq!(client.checkpoint()?, checkpoint);
            assert_eq!(
                socket.request(json!({"kind":"submit","group":frame})).await?["code"],
                "lease_rejected"
            );
            assert_eq!(client.checkpoint()?, checkpoint);
            let mut restored = ServerLogGenerationRoomRecovery::begin(
                &d.0.join("inactive-restored"),
                sealed.backup(),
                &current.info()?.identity,
                RoomRecoveryPolicy::HostReacquired,
            )?
            .finish(sealed.backup())?;
            let writer = restored.room_mut().resume(
                "owner",
                &registration.lease.writer,
                &registration.credential,
            )?;
            assert_exact_offline_retry(restored.room_mut(), &writer, frame)?;
            let observer = profile.join_frame(
                "room".into(),
                "99".into(),
                &restored.room().catchup("owner")?,
            )?;
            assert_eq!(observer.document_json(), client.document_json());
            let document = client.document_json().to_owned();
            assert!(client.undo()?);
            assert!(client.redo()?);
            assert_eq!(client.document_json(), document);
            drop(restored);
            drop(socket);
            network.stop().await?;
        }
    }
    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn admitted_old_http_raster_body_cannot_publish_after_the_actual_generation_fence()
-> TestResult {
    let d = Directory::new()?;
    let (room, _) = source(&d, 3, true, true, true)?;
    let assets = AssetStore::open(&d.0.join("assets"), room.asset_binding())?;
    let authority = RoomDeploymentAuthority::create(&d.authority(), &room.deployment_binding()?)?;
    let lease = authority.claim(&authority.current_selection()?)?;
    let (token, _) = Authentication::issue_token()?;
    let (reader, _) = Authentication::issue_token()?;
    let (router, handle) = router_with_log_generation_backups_and_deployment_lease(
        room,
        authentication(&token, &reader)?,
        assets,
        lease,
        "owner",
        &token,
    )
    .await?;
    let network = Network::start(router).await?;
    let old = handle.capture("owner", &token).await?;
    let mut bytes = Cursor::new(Vec::new());
    image::DynamicImage::new_rgb8(2, 3).write_to(&mut bytes, image::ImageFormat::Png)?;
    let bytes = bytes.into_inner();
    let path = format!("/assets/{}", asset_id(&bytes));
    assert_eq!(network.http("PUT", &path, &token, &bytes).await?.0, 200);
    let current = handle.capture("owner", &token).await?;
    stale(&handle, &token, &old.info()?.identity).await?;
    let mut later = Cursor::new(Vec::new());
    image::DynamicImage::new_rgb8(3, 4).write_to(&mut later, image::ImageFormat::Png)?;
    let later = later.into_inner();
    let late_path = format!("/assets/{}", asset_id(&later));
    let body = network.admitted_upload(&late_path, &token, later.len()).await?;
    let sealed = seal(&handle, &token, &current.info()?.identity).await?;
    assert_eq!(sealed.backup().to_bytes()?, current.to_bytes()?);
    assert_ne!(Network::finish_upload(body, &later).await?.0, 200);
    let restored = ServerLogGenerationRoomRecovery::begin(
        &d.0.join("inactive-restored"),
        sealed.backup(),
        &current.info()?.identity,
        RoomRecoveryPolicy::HostReacquired,
    )?
    .finish(sealed.backup())?;
    assert_eq!(restored.assets().count(), 1);
    assert!(restored.room().read_asset("owner", restored.assets(), &asset_id(&bytes))?.is_some());
    assert!(restored.room().read_asset("owner", restored.assets(), &asset_id(&later))?.is_none());
    drop(restored);
    network.stop().await?;
    Ok(())
}

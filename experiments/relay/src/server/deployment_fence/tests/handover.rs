//! Real exact-cut source fencing, late native writes and absent-only full recovery.
use super::super::{RoomDeploymentAuthority, transaction::transaction};
use super::{
    fixture::{Directory, TestResult, authentication, groups, room},
    network::{Network, Socket},
};
use crate::{
    Error, RoomRecoveryPolicy, ServerRoomRecovery,
    assets::{AssetStore, asset_id},
    server::{
        Authentication, SealedServerHandover, ServerBackupHandle, router_with_server_backups,
        router_with_server_backups_and_deployment_lease,
    },
};
use breditor_collab_feasibility::rich_replica::{Command, actions::InsertText};
use serde_json::json;
use std::{fs, io::Cursor, time::Duration};

async fn seal_idle(
    handle: &ServerBackupHandle,
    expected: &crate::ServerRoomBackupIdentity,
) -> TestResult<SealedServerHandover> {
    let deadline = tokio::time::Instant::now() + Duration::from_secs(5);
    loop {
        match handle.seal_for_handover(expected.clone()).await {
            Ok(sealed) => return Ok(sealed),
            Err(Error::Locked) if tokio::time::Instant::now() < deadline => {
                tokio::time::sleep(Duration::from_millis(2)).await;
            }
            Err(error) => return Err(error.into()),
        }
    }
}
async fn stale_idle(
    handle: &ServerBackupHandle,
    expected: &crate::ServerRoomBackupIdentity,
) -> TestResult {
    let deadline = tokio::time::Instant::now() + Duration::from_secs(5);
    loop {
        match handle.seal_for_handover(expected.clone()).await {
            Err(Error::Locked) if tokio::time::Instant::now() < deadline => {
                tokio::time::sleep(Duration::from_millis(2)).await;
            }
            Err(Error::Contract("handover source cut changed")) => return Ok(()),
            _ => return Err("stale source selection did not refuse without sealing".into()),
        }
    }
}
async fn authenticate(
    socket: &mut Socket,
    token: &str,
    atomic: bool,
    registration: &crate::Registration,
) -> TestResult {
    assert_eq!(socket.request(json!({"kind":"authenticate","principal":"owner","token":token,"capabilities":if atomic {vec!["writerTransportV2"]}else{vec![]}})).await?["kind"], "authenticated");
    assert_eq!(socket.request(json!({"kind":"resume","writer":registration.lease.writer,"credential":registration.credential})).await?["kind"], "resumed");
    Ok(())
}
async fn restore(
    d: &Directory,
    sealed: SealedServerHandover,
    authority: &RoomDeploymentAuthority,
    token: &str,
) -> TestResult<Network> {
    let selected = sealed.backup().info().identity;
    let recovered = ServerRoomRecovery::begin(
        &d.0.join("restored"),
        sealed.backup(),
        &selected,
        RoomRecoveryPolicy::HostReacquired,
    )?
    .finish(sealed.backup())?;
    let backup = sealed.into_backup();
    let (room, assets) = recovered.into_parts();
    let next = authority.claim(&authority.current_selection()?)?;
    assert_eq!(next.selection().generation, "3");
    let (router, copied) = router_with_server_backups_and_deployment_lease(
        room,
        authentication(token)?,
        assets,
        next,
    )?;
    assert_eq!(copied.capture().await?.to_bytes()?, backup.to_bytes()?);
    let replacement = Network::start(router).await?;

    Ok(replacement)
}
async fn lifecycle(version: u32, standard: bool, atomic: bool) -> TestResult {
    let d = Directory::new()?;
    let path = d.0.join("source.log");
    let (mut source, profile) = room(&path, version, standard, atomic)?;
    let registration = source.register("owner")?;
    let mut client = profile.join_frame(
        "room".into(),
        registration.lease.writer.clone(),
        &source.catchup("owner")?,
    )?;
    let assets = AssetStore::open(&d.0.join("assets"), source.asset_binding())?;
    let authority = RoomDeploymentAuthority::create(&d.authority(), &source.deployment_binding()?)?;
    let lease = authority.claim(&authority.current_selection()?)?;
    let first = lease.selection();
    let (token, _) = Authentication::issue_token()?;
    let (router, handle) = router_with_server_backups_and_deployment_lease(
        source,
        authentication(&token)?,
        assets,
        lease.clone(),
    )?;
    let network = Network::start(router).await?;
    let mut socket = Socket::connect(network.address).await?;
    authenticate(&mut socket, &token, atomic, &registration).await?;
    let stale = handle.capture().await?.info().identity;
    client.apply(vec![Command::InsertText(InsertText {
        block: "p".into(),
        offset: 0,
        text: "late-accepted 🙂".into(),
    })])?;
    let pending = groups(&client, "0", atomic)?;
    for frame in pending["groups"].as_array().ok_or("late groups")? {
        assert_eq!(
            socket.request(json!({"kind":"submit","group":frame})).await?["kind"],
            "durable"
        );
    }
    let current = handle.capture().await?;
    let expected = current.info().identity;
    assert_ne!(expected, stale);
    let ledger = fs::read(d.authority().join("authority.log"))?;
    let native = fs::read(&path)?;
    let checkpoint = client.checkpoint()?;
    stale_idle(&handle, &stale).await?;
    assert_eq!(fs::read(d.authority().join("authority.log"))?, ledger);
    assert_eq!(fs::read(&path)?, native);
    assert_eq!(client.checkpoint()?, checkpoint);
    assert_eq!(handle.capture().await?.info().identity, expected);
    assert_eq!(authority.current_selection()?, first);
    // This unaccepted offline operation must remain at the client, not become
    // acknowledged by a server seal, and must replay exactly on a fresh host.
    client.apply(vec![Command::InsertText(InsertText {
        block: "p".into(),
        offset: 0,
        text: "offline-pending".into(),
    })])?;
    let offline = groups(&client, pending["through"].as_str().ok_or("through")?, atomic)?;
    let frame = offline["groups"][0].as_str().ok_or("offline group")?;
    let checkpoint = client.checkpoint()?;
    let sealed = seal_idle(&handle, &expected).await?;
    assert_eq!(sealed.previous_selection(), &first);
    assert_eq!(sealed.sealed_selection(), &authority.current_selection()?);
    assert_eq!(sealed.sealed_selection().generation, "2");
    assert_eq!(sealed.backup().to_bytes()?, current.to_bytes()?);
    assert_eq!(fs::read(&path)?, native);
    assert_eq!(client.checkpoint()?, checkpoint);
    assert!(matches!(lease.check(), Err(Error::Lease)));
    assert!(matches!(handle.capture().await, Err(Error::Lease)));
    assert!(matches!(handle.seal_for_handover(expected.clone()).await, Err(Error::Lease)));
    assert_eq!(
        socket.request(json!({"kind":"submit","group":frame})).await?["code"],
        "lease_rejected"
    );
    assert_eq!(fs::read(&path)?, native);
    let replacement = restore(&d, sealed, &authority, &token).await?;
    let mut retry = Socket::connect(replacement.address).await?;
    authenticate(&mut retry, &token, atomic, &registration).await?;
    let accepted = retry.request(json!({"kind":"submit","group":frame})).await?;
    assert_eq!(accepted["kind"], "durable");
    assert_eq!(accepted["duplicate"], false);
    let duplicate = retry.request(json!({"kind":"submit","group":frame})).await?;
    assert_eq!(duplicate["duplicate"], true);
    assert_eq!(duplicate["sequence"], accepted["sequence"]);
    let caught = retry.request(json!({"kind":"sync"})).await?;
    let observer =
        profile.join_frame("room".into(), "99".into(), caught["frame"].as_str().ok_or("frame")?)?;
    assert_eq!(observer.document_json(), client.document_json());
    let document = client.document_json().to_owned();
    assert!(client.undo()?);
    assert!(client.redo()?);
    assert_eq!(client.document_json(), document);
    drop(retry);
    drop(socket);
    replacement.stop().await?;
    network.stop().await?;
    Ok(())
}
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn all_ten_original_profiles_fence_exact_cut_and_keep_offline_retry_and_future_history()
-> TestResult {
    for (version, standard) in [(1, false), (2, false), (2, true), (3, false), (3, true)] {
        for atomic in [false, true] {
            lifecycle(version, standard, atomic).await?;
        }
    }
    Ok(())
}
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn late_unreferenced_raster_refuses_stale_seal_and_admitted_upload_cannot_cross_it()
-> TestResult {
    let d = Directory::new()?;
    let (source, _) = room(&d.0.join("source.log"), 3, true, true)?;
    let store = AssetStore::open(&d.0.join("assets"), source.asset_binding())?;
    let authority = RoomDeploymentAuthority::create(&d.authority(), &source.deployment_binding()?)?;
    let lease = authority.claim(&authority.current_selection()?)?;
    let (token, _) = Authentication::issue_token()?;
    let (router, handle) = router_with_server_backups_and_deployment_lease(
        source,
        authentication(&token)?,
        store,
        lease,
    )?;
    let network = Network::start(router).await?;
    let before = handle.capture().await?;
    let mut png = Cursor::new(Vec::new());
    image::DynamicImage::new_rgb8(2, 3).write_to(&mut png, image::ImageFormat::Png)?;
    let png = png.into_inner();
    let path = format!("/assets/{}", asset_id(&png));
    assert_eq!(network.http("PUT", &path, &token, &png).await?.0, 200);
    let current = handle.capture().await?;
    assert_ne!(current.info().identity.assets, before.info().identity.assets);
    let ledger = fs::read(d.authority().join("authority.log"))?;
    stale_idle(&handle, &before.info().identity).await?;
    assert_eq!(fs::read(d.authority().join("authority.log"))?, ledger);
    let mut later = Cursor::new(Vec::new());
    image::DynamicImage::new_rgb8(3, 4).write_to(&mut later, image::ImageFormat::Png)?;
    let later = later.into_inner();
    let late_path = format!("/assets/{}", asset_id(&later));
    let body = network.admitted_upload(&late_path, &token, later.len()).await?;
    let sealed = seal_idle(&handle, &current.info().identity).await?;
    assert_eq!(sealed.backup().to_bytes()?, current.to_bytes()?);
    assert_ne!(Network::finish_upload(body, &later).await?.0, 200);
    let restored = ServerRoomRecovery::begin(
        &d.0.join("restored"),
        sealed.backup(),
        &current.info().identity,
        RoomRecoveryPolicy::HostReacquired,
    )?
    .finish(sealed.backup())?;
    let (room, mut assets) = restored.into_parts();
    assert_eq!(assets.count(), 1);
    assert!(room.read_asset("owner", &assets, &asset_id(&png))?.is_some());
    assert!(room.read_asset("owner", &assets, &asset_id(&later))?.is_none());
    assert_eq!(assets.export_backup()?.info().identity, current.info().identity.assets);
    network.stop().await?;
    Ok(())
}
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn busy_closed_and_unfenced_sources_cannot_seal_and_legacy_claim_still_is_only_epoch_cas()
-> TestResult {
    let d = Directory::new()?;
    let (room, _) = room(&d.0.join("source.log"), 1, false, false)?;
    let store = AssetStore::open(&d.0.join("assets"), room.asset_binding())?;
    let authority = RoomDeploymentAuthority::create(&d.authority(), &room.deployment_binding()?)?;
    let lease = authority.claim(&authority.current_selection()?)?;
    let selected = lease.selection();
    let (token, _) = Authentication::issue_token()?;
    let (router, handle) = router_with_server_backups_and_deployment_lease(
        room,
        authentication(&token)?,
        store,
        lease.clone(),
    )?;
    let expected = handle.capture().await?.info().identity;
    let ledger = fs::read(d.authority().join("authority.log"))?;
    let permit = lease.serving()?;
    assert!(matches!(handle.seal_for_handover(expected.clone()).await, Err(Error::Locked)));
    permit.finish()?;
    assert_eq!(fs::read(d.authority().join("authority.log"))?, ledger);
    lease.close();
    assert!(matches!(handle.seal_for_handover(expected.clone()).await, Err(Error::Lease)));
    assert_eq!(authority.current_selection()?, selected);
    let next = authority.claim(&selected)?;
    next.check()?;
    assert!(transaction::<()>(Some(&lease), || panic!("closed lease must never run")).is_err());
    drop(handle);
    drop(router);
    let (room, _) = super::fixture::room(&d.0.join("unfenced.log"), 1, false, false)?;
    let store = AssetStore::open(&d.0.join("unfenced-assets"), room.asset_binding())?;
    let (router, handle) = router_with_server_backups(room, authentication(&token)?, store)?;
    let expected = handle.capture().await?.info().identity;
    assert!(matches!(
        handle.seal_for_handover(expected).await,
        Err(Error::Contract("fenced source host required"))
    ));
    assert!(handle.capture().await.is_ok());
    drop(handle);
    drop(router);
    Ok(())
}
#[test]
fn internal_claim_requires_exact_authority_and_real_exclusive_permit() -> TestResult {
    use super::super::permit::Permit;
    let d = Directory::new()?;
    let a = RoomDeploymentAuthority::create(&d.authority(), &"a".repeat(64))?;
    let b = RoomDeploymentAuthority::create(&d.0.join("other"), &"a".repeat(64))?;
    let choice = a.current_selection()?;
    let before = fs::read(d.authority().join("authority.log"))?;
    let mut shared = Permit::try_acquire(&a.state, false)?;
    assert!(a.claim_held(&mut shared, &choice).is_err());
    shared.finish()?;
    let mut foreign = Permit::try_acquire(&b.state, true)?;
    assert!(a.claim_held(&mut foreign, &choice).is_err());
    foreign.finish()?;
    assert_eq!(fs::read(d.authority().join("authority.log"))?, before);
    Ok(())
}

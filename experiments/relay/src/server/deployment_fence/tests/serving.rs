//! Actual stale-server rejection and exact offline retry on a recovered native room.
use super::super::{
    RoomDeploymentAuthority, RoomDeploymentLease, router_with_assets_and_deployment_lease,
    router_with_deployment_lease,
};
use super::{
    fixture::{Directory, TestResult, authentication, groups, room},
    network::{Network, Socket},
};
use crate::{
    Admission, Room, RoomRecoveryPolicy,
    assets::{AssetStore, asset_id},
};
use breditor_collab_feasibility::rich_replica::{Command, actions::InsertText};
use serde_json::{Value, json};
use std::{fs, io::Cursor};

// Live sockets can still have notification reads in flight after replying. A
// takeover retries only genuine lock contention, against a fresh exact choice;
// it never treats a preflight read or a fixed sleep as a quiescence witness.
async fn claim_when_idle(authority: &RoomDeploymentAuthority) -> TestResult<RoomDeploymentLease> {
    let deadline = tokio::time::Instant::now() + std::time::Duration::from_secs(5);
    loop {
        let claimed = authority.current_selection().and_then(|choice| authority.claim(&choice));
        match claimed {
            Ok(lease) => return Ok(lease),
            Err(crate::Error::Locked) if tokio::time::Instant::now() < deadline => {
                tokio::time::sleep(std::time::Duration::from_millis(2)).await;
            }
            Err(error) => return Err(error.into()),
        }
    }
}

async fn offline_case(version: u32, standard: bool, atomic: bool) -> TestResult {
    let d = Directory::new()?;
    let path = d.0.join("old.log");
    let (mut old, profile) = room(&path, version, standard, atomic)?;
    let registration = old.register("owner")?;
    let mut replica = profile.join_frame(
        "room".into(),
        registration.lease.writer.clone(),
        &old.catchup("owner")?,
    )?;
    replica.apply(vec![Command::InsertText(InsertText {
        block: "p".into(),
        offset: 0,
        text: "accepted-before-cut".into(),
    })])?;
    let accepted = groups(&replica, "0", atomic)?;
    for group in accepted["groups"].as_array().ok_or("accepted groups")? {
        assert!(matches!(
            old.admit("owner", &registration.lease, group.as_str().ok_or("frame")?)?,
            Admission::Durable(_)
        ));
    }
    let through = accepted["through"].as_str().ok_or("through")?;
    let expected = old.backup_identity()?;
    let backup = old.export_backup()?;
    let new_path = d.0.join("recovered.log");
    let recovered =
        Room::restore_backup(&new_path, &backup, &expected, RoomRecoveryPolicy::HostReacquired)?;
    assert_eq!(old.deployment_binding()?, recovered.deployment_binding()?);
    replica.apply(vec![Command::InsertText(InsertText {
        block: "p".into(),
        offset: 0,
        text: "offline-after-cut".into(),
    })])?;
    let pending = groups(&replica, through, atomic)?;
    assert_eq!(pending["groups"].as_array().ok_or("pending")?.len(), 1);
    let group = pending["groups"][0].as_str().ok_or("offline frame")?.to_owned();
    let native = replica.checkpoint()?;
    let authority = RoomDeploymentAuthority::create(&d.authority(), &old.deployment_binding()?)?;
    let lease = authority.claim(&authority.current_selection()?)?;
    let (token, _) = crate::server::Authentication::issue_token()?;
    let first =
        Network::start(router_with_deployment_lease(old, authentication(&token)?, lease.clone())?)
            .await?;
    let mut previous = Socket::connect(first.address).await?;
    assert_eq!(previous.request(json!({"kind":"authenticate","principal":"owner","token":token,"capabilities":if atomic {vec!["writerTransportV2"]}else{vec![]}})).await?["kind"], "authenticated");
    assert_eq!(previous.request(json!({"kind":"resume","writer":registration.lease.writer,"credential":registration.credential})).await?["kind"], "resumed");
    // Wait for resume's queued catchup before advancing the epoch so the next rejection
    // comes from the stale submit on this socket.
    assert_eq!(previous.notification().await?["kind"], "catchup");
    let replacement = RoomDeploymentAuthority::open(&d.authority(), &authority.identity())?;
    let next = claim_when_idle(&replacement).await?;
    let second =
        Network::start(router_with_deployment_lease(recovered, authentication(&token)?, next)?)
            .await?;
    let before = fs::read(&path)?;
    let rejected = previous.request(json!({"kind":"submit","group":group})).await?;
    assert_eq!(rejected["code"], "lease_rejected");
    assert_eq!(fs::read(&path)?, before);
    assert_eq!(replica.checkpoint()?, native);
    assert!(lease.check().is_err());
    let mut current = Socket::connect(second.address).await?;
    assert_eq!(current.request(json!({"kind":"authenticate","principal":"owner","token":token,"capabilities":if atomic {vec!["writerTransportV2"]}else{vec![]}})).await?["kind"], "authenticated");
    assert_eq!(current.request(json!({"kind":"resume","writer":registration.lease.writer,"credential":registration.credential})).await?["kind"], "resumed");
    let committed = current.request(json!({"kind":"submit","group":group})).await?;
    assert_eq!(committed["kind"], "durable");
    assert_eq!(committed["duplicate"], false);
    let bytes = fs::read(&new_path)?;
    let retried = current.request(json!({"kind":"submit","group":group})).await?;
    assert_eq!(retried["kind"], "durable");
    assert_eq!(retried["duplicate"], true);
    assert_eq!(retried["sequence"], committed["sequence"]);
    assert_eq!(fs::read(&new_path)?, bytes);
    let caught = current.request(json!({"kind":"sync"})).await?;
    let observer = profile.join_frame(
        "room".into(),
        "99".into(),
        caught["frame"].as_str().ok_or("catchup")?,
    )?;
    assert_eq!(observer.document_json(), replica.document_json());
    let document = replica.document_json().to_owned();
    assert!(replica.undo()?);
    assert!(replica.redo()?);
    assert_eq!(replica.document_json(), document);
    drop(previous);
    drop(current);
    first.stop().await?;
    second.stop().await?;
    Ok(())
}
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn original_writer_retries_its_exact_offline_group_after_old_host_is_fenced() -> TestResult {
    offline_case(1, false, false).await
}
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn atomic_layout_writer_retries_its_exact_offline_group_after_old_host_is_fenced()
-> TestResult {
    offline_case(3, true, true).await
}
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn all_other_native_profile_transport_pairs_preserve_offline_retry_and_future_history()
-> TestResult {
    for (version, standard) in [(1, false), (2, false), (2, true), (3, false), (3, true)] {
        for atomic in [false, true] {
            if (version, standard, atomic) != (1, false, false)
                && (version, standard, atomic) != (3, true, true)
            {
                offline_case(version, standard, atomic).await?;
            }
        }
    }
    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn asset_body_admitted_before_takeover_cannot_publish_after_the_epoch_changes() -> TestResult
{
    let d = Directory::new()?;
    let path = d.0.join("room.log");
    let (room, _) = room(&path, 3, true, true)?;
    let assets = d.0.join("assets");
    let store = AssetStore::open(&assets, room.asset_binding())?;
    let authority = RoomDeploymentAuthority::create(&d.authority(), &room.deployment_binding()?)?;
    let lease = authority.claim(&authority.current_selection()?)?;
    let (token, _) = crate::server::Authentication::issue_token()?;
    let server = Network::start(router_with_assets_and_deployment_lease(
        room,
        authentication(&token)?,
        store,
        lease,
    )?)
    .await?;
    let mut first = Cursor::new(Vec::new());
    image::DynamicImage::new_rgb8(2, 3).write_to(&mut first, image::ImageFormat::Png)?;
    let first = first.into_inner();
    let one = format!("/assets/{}", asset_id(&first));
    assert_eq!(server.http("PUT", &one, &token, &first).await?.0, 200);
    let mut second = Cursor::new(Vec::new());
    image::DynamicImage::new_rgb8(3, 4).write_to(&mut second, image::ImageFormat::Png)?;
    let second = second.into_inner();
    let two = format!("/assets/{}", asset_id(&second));
    let body = server.admitted_upload(&two, &token, second.len()).await?;
    let before = snapshot(&assets)?;
    let log = fs::read(&path)?;
    let next = authority.claim(&authority.current_selection()?)?;
    next.check()?;
    let refused = Network::finish_upload(body, &second).await?;
    assert_eq!(refused.0, 403);
    assert_eq!(serde_json::from_slice::<Value>(&refused.1)?["code"], "lease_rejected");
    assert_eq!(snapshot(&assets)?, before);
    assert_eq!(fs::read(&path)?, log);
    assert_eq!(server.http("GET", &one, &token, &[]).await?.0, 403);
    server.stop().await?;
    Ok(())
}
fn snapshot(path: &std::path::Path) -> TestResult<Vec<(String, Vec<u8>)>> {
    let mut rows = Vec::new();
    for row in fs::read_dir(path)? {
        let row = row?;
        if row.file_type()?.is_file() {
            rows.push((row.file_name().to_string_lossy().into_owned(), fs::read(row.path())?));
        }
    }
    rows.sort();
    Ok(rows)
}

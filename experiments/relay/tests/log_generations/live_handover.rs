//! External consumer: only exported APIs, genuine source ownership and actual files.
use super::{TestResult, insert, setup};
use breditor_collab_relay::{
    Role, RoomRecoveryPolicy, ServerLogGenerationRoomRecovery,
    server::{
        Authentication, RoomDeploymentAuthority, RoomDeploymentSelection,
        router_with_log_generation_backups_and_deployment_lease,
    },
};
use serde_json::json;
use std::fs;
#[path = "live_handover/author.rs"]
mod author;
#[path = "live_handover/roundtrip.rs"]
mod roundtrip;

fn authentication() -> TestResult<(Authentication, String, String)> {
    let (owner, owner_hash) = Authentication::issue_token()?;
    let (reader, reader_hash) = Authentication::issue_token()?;
    let value = json!({"format":"breditor/relay-auth","formatVersion":1,"accounts":[{"principal":"owner","tokenHash":owner_hash},{"principal":"reader","tokenHash":reader_hash}],"origins":["http://127.0.0.1:4187"]});
    Ok((Authentication::from_json(&value.to_string())?, owner, reader))
}
async fn workflow(version: u32, standard: bool, atomic: bool) -> TestResult {
    let (files, profile, mut room) = setup(version, standard, atomic)?;
    let mut prepared =
        author::prepare(&mut room, &profile, &files.0.join("source-assets"), atomic)?;
    let authority = RoomDeploymentAuthority::create(
        &files.0.join("source-authority"),
        &room.deployment_binding()?,
    )?;
    let lease = authority.claim(&authority.current_selection()?)?;
    let previous = lease.selection();
    let (authentication, owner, _) = authentication()?;
    let (router, handle) = router_with_log_generation_backups_and_deployment_lease(
        room,
        authentication,
        prepared.assets,
        lease.clone(),
        "owner",
        &owner,
    )
    .await?;
    let source = handle.capture("owner", &owner).await?;
    insert(&mut prepared.author.document, "offline document ")?;
    author::comment(&prepared.author.document, &mut prepared.author.review, "offline comment")?;
    let document = prepared.author.document.checkpoint()?;
    let comments = prepared.author.review.checkpoint_json()?;
    let sealed = handle.seal_for_handover("owner", &owner, source.info()?.identity).await?;
    assert_eq!(sealed.previous_selection(), &previous);
    assert_eq!(sealed.sealed_selection(), &authority.current_selection()?);
    assert_eq!(sealed.backup().to_bytes()?, source.to_bytes()?);
    assert!(lease.check().is_err());
    assert!(handle.capture("owner", &owner).await.is_err());
    assert_eq!(prepared.author.document.checkpoint()?, document);
    assert_eq!(prepared.author.review.checkpoint_json()?, comments);
    let pin: RoomDeploymentSelection =
        serde_json::from_slice(&serde_json::to_vec(sealed.sealed_selection())?)?;
    let reopened = RoomDeploymentAuthority::open_at_least(&files.0.join("source-authority"), &pin)?;
    assert_eq!(reopened.current_selection()?, pin);
    let mut restored = ServerLogGenerationRoomRecovery::begin(
        &files.0.join("inactive-restored"),
        sealed.backup(),
        &source.info()?.identity,
        RoomRecoveryPolicy::HostReacquired,
    )?
    .finish(sealed.backup())?;
    assert_eq!(
        restored
            .room()
            .read_asset("owner", restored.assets(), &prepared.asset)?
            .ok_or("restored raster")?
            .bytes,
        prepared.png
    );
    roundtrip::reconnect(restored.room_mut(), &mut prepared.author, atomic)?;
    roundtrip::check_document(&profile, restored.room(), &prepared.author)?;
    drop(restored);
    drop(handle);
    drop(router);
    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn all_ten_public_handover_modes_keep_both_offline_lanes_exact_retries_and_rasters()
-> TestResult {
    for (version, standard) in [(1, false), (2, false), (2, true), (3, false), (3, true)] {
        for atomic in [false, true] {
            workflow(version, standard, atomic).await?;
        }
    }
    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn current_account_and_owner_checks_cannot_retire_or_disclose_the_source() -> TestResult {
    let (files, profile, mut room) = setup(3, true, true)?;
    room.grant("owner", "reader", Some(Role::Reader))?;
    let prepared = author::prepare(&mut room, &profile, &files.0.join("source-assets"), true)?;
    let path = files.0.join("source-authority");
    let authority = RoomDeploymentAuthority::create(&path, &room.deployment_binding()?)?;
    let lease = authority.claim(&authority.current_selection()?)?;
    let (authentication, owner, reader) = authentication()?;
    let (_router, handle) = router_with_log_generation_backups_and_deployment_lease(
        room,
        authentication,
        prepared.assets,
        lease,
        "owner",
        &owner,
    )
    .await?;
    let source = handle.capture("owner", &owner).await?;
    let ledger = fs::read(path.join("authority.log"))?;
    assert!(handle.capture("owner", &reader).await.is_err());
    assert!(handle.capture("reader", &reader).await.is_err());
    assert!(handle.seal_for_handover("reader", &reader, source.info()?.identity).await.is_err());
    assert_eq!(fs::read(path.join("authority.log"))?, ledger);
    assert_eq!(handle.capture("owner", &owner).await?.to_bytes()?, source.to_bytes()?);
    Ok(())
}

#[test]
fn a_serialized_cold_selection_refuses_rollback_without_reissuing_a_saved_lease() -> TestResult {
    let (files, _, room) = setup(3, true, true)?;
    let path = files.0.join("source-authority");
    let authority = RoomDeploymentAuthority::create(&path, &room.deployment_binding()?)?;
    let first = authority.claim(&authority.current_selection()?)?;
    let older = fs::read(path.join("authority.log"))?;
    let second = authority.claim(&first.selection())?;
    let pin: RoomDeploymentSelection =
        serde_json::from_slice(&serde_json::to_vec(&second.selection())?)?;
    authority.close()?;
    fs::write(path.join("authority.log"), &older)?;
    assert!(RoomDeploymentAuthority::open_at_least(&path, &pin).is_err());
    assert_eq!(fs::read(path.join("authority.log"))?, older);
    assert!(first.check().is_err());
    assert!(second.check().is_err());
    Ok(())
}

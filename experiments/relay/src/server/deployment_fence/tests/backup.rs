//! Actual private backup handles cannot bypass the native serving permit.
use super::super::{RoomDeploymentAuthority, router_with_deployment_lease};
use super::fixture::{Directory, TestResult, authentication, room};
use crate::{
    Error,
    assets::AssetStore,
    server::{Authentication, router_with_server_backups_and_deployment_lease},
};
use std::fs;

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn private_backup_handle_holds_the_same_epoch_and_refuses_after_takeover() -> TestResult {
    let d = Directory::new()?;
    let path = d.0.join("room.log");
    let (room, _) = room(&path, 3, true, true)?;
    let assets = AssetStore::open(&d.0.join("assets"), room.asset_binding())?;
    let a = RoomDeploymentAuthority::create(&d.authority(), &room.deployment_binding()?)?;
    let lease = a.claim(&a.current_selection()?)?;
    let (token, _) = Authentication::issue_token()?;
    let (router, handle) = router_with_server_backups_and_deployment_lease(
        room,
        authentication(&token)?,
        assets,
        lease.clone(),
    )?;
    let archive = handle.capture().await?;
    assert_eq!(archive.info().format_version, 1);
    let before = fs::read(&path)?;
    let other = RoomDeploymentAuthority::open(&d.authority(), &a.identity())?;
    let next = other.claim(&other.current_selection()?)?;
    next.check()?;
    assert!(matches!(handle.capture().await, Err(Error::Lease)));
    assert_eq!(fs::read(&path)?, before);
    drop(handle);
    drop(router);
    Ok(())
}

#[test]
fn serving_refuses_a_genuine_lease_for_another_immutable_room() -> TestResult {
    let d = Directory::new()?;
    let (first, _) = room(&d.0.join("one.log"), 1, false, false)?;
    let a = RoomDeploymentAuthority::create(&d.authority(), &first.deployment_binding()?)?;
    let lease = a.claim(&a.current_selection()?)?;
    let (other, _) = room(&d.0.join("other.log"), 3, true, true)?;
    let (token, _) = Authentication::issue_token()?;
    assert!(matches!(
        router_with_deployment_lease(other, authentication(&token)?, lease),
        Err(Error::Contract(_))
    ));
    Ok(())
}

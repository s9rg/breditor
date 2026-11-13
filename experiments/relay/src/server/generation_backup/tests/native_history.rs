//! History maintenance on an actual live deployment and its original WAL.
use super::{
    Authentication, Directory, Error, RoomDeploymentAuthority, TestResult, authentication, source,
};
use crate::{
    Room, ServerNativeHistoryBoundary as Boundary, ServerNativeHistoryFamily as Family,
    ServerNativeHistoryLane as Lane, assets::AssetStore,
    server::router_with_log_generation_backups_and_deployment_lease,
};

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn fenced_source_history_maintenance_retains_the_original_receipt_and_refuses_old_epochs()
-> TestResult {
    let directory = Directory::new()?;
    let (mut room, _) = source(&directory, 3, true, true, true)?;
    room.enable_review("owner")?;
    let assets = AssetStore::open(&directory.0.join("assets"), room.asset_binding())?;
    let authority =
        RoomDeploymentAuthority::create(&directory.authority(), &room.deployment_binding()?)?;
    let lease = authority.claim(&authority.current_selection()?)?;
    let (owner, _) = Authentication::issue_token()?;
    let (reader, _) = Authentication::issue_token()?;
    let (router, handle) = router_with_log_generation_backups_and_deployment_lease(
        room,
        authentication(&owner, &reader)?,
        assets,
        lease.clone(),
        "owner",
        &owner,
    )
    .await?;
    let enable = Boundary::Enable { root: "document-root".into(), active: "first".into() };
    let before = handle.storage_capacity("owner", &owner).await?.log;
    for (principal, token) in [("owner", &reader), ("reader", &reader)] {
        assert!(matches!(
            handle
                .apply_native_history_boundary(principal, token, Lane::Document, enable.clone())
                .await,
            Err(Error::Permission)
        ));
    }
    assert_eq!(handle.storage_capacity("owner", &owner).await?.log, before);
    handle.apply_native_history_boundary("owner", &owner, Lane::Document, enable).await?;
    let continuation = Boundary::ContinueDocument { next: "continued".into() };
    let receipt = handle
        .apply_native_history_boundary("owner", &owner, Lane::Document, continuation.clone())
        .await?;
    let after = handle.storage_capacity("owner", &owner).await?.log;
    let retry = handle
        .apply_native_history_boundary("owner", &owner, Lane::Document, continuation.clone())
        .await?;
    assert_eq!(retry, crate::ServerNativeHistoryReceipt { duplicate: true, ..receipt });
    assert_eq!(handle.storage_capacity("owner", &owner).await?.log, after);

    authority.claim(&lease.selection())?.close();
    assert!(matches!(
        handle.apply_native_history_boundary("owner", &owner, Lane::Document, continuation).await,
        Err(Error::Lease)
    ));
    drop((router, handle));
    let (room, _) = Room::open_log_generations(&directory.0.join("source"))?;
    let descriptor = room.native_history_descriptor("owner")?;
    assert_eq!(descriptor.document, Family::ContinuedV2);
    assert_eq!(descriptor.review, Some(Family::Original));
    let assets = AssetStore::open_retained(&directory.0.join("assets"), room.asset_binding())?;
    assert_eq!(room.storage_capacity(&assets, "owner")?.log, after);
    Ok(())
}

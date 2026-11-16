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
    let native_before = handle.native_history_capacity("owner", &owner).await?;
    assert_eq!(native_before.document.family, Family::Original);
    assert_eq!(native_before.document.capacity.generation_files, None);
    assert_eq!(native_before.review.ok_or("review capacity")?.family, Family::Original);
    assert_eq!(native_before.suggestion_effect, None);
    assert_eq!(native_before.boundary_records.limit, 128);
    for (principal, token) in [("owner", &reader), ("reader", &reader)] {
        assert!(matches!(
            handle.native_history_capacity(principal, token).await,
            Err(Error::Permission)
        ));
        assert!(matches!(
            handle
                .apply_native_history_boundary(principal, token, Lane::Document, enable.clone())
                .await,
            Err(Error::Permission)
        ));
    }
    assert_eq!(handle.storage_capacity("owner", &owner).await?.log, before);
    assert_eq!(handle.native_history_capacity("owner", &owner).await?, native_before);
    handle.apply_native_history_boundary("owner", &owner, Lane::Document, enable).await?;
    let continuation = Boundary::ContinueDocument { next: "continued".into() };
    let plan = handle
        .prepare_native_history_boundary("owner", &owner, Lane::Document, continuation.clone())
        .await?;
    assert!(matches!(
        handle
            .apply_prepared_native_history_boundary("reader", &reader, plan.selection.clone())
            .await,
        Err(Error::Permission)
    ));
    let receipt = handle
        .apply_prepared_native_history_boundary("owner", &owner, plan.selection.clone())
        .await?;
    let after = handle.storage_capacity("owner", &owner).await?.log;
    let native_after = handle.native_history_capacity("owner", &owner).await?;
    assert_eq!(native_after, plan.capacity_after);
    assert_eq!(native_after.document.family, Family::ContinuedV2);
    assert_eq!(
        native_after.document.capacity.generation_files.ok_or("generation capacity")?.used,
        3
    );
    assert_eq!(native_after.review, native_before.review);
    assert_eq!(native_after.boundary_records.limit, 320);
    assert_eq!(native_after.boundary_records.used, 2);
    let retry = handle
        .apply_native_history_boundary("owner", &owner, Lane::Document, continuation.clone())
        .await?;
    assert_eq!(retry, crate::ServerNativeHistoryReceipt { duplicate: true, ..receipt });
    assert_eq!(handle.storage_capacity("owner", &owner).await?.log, after);
    assert_eq!(handle.native_history_capacity("owner", &owner).await?, native_after);

    authority.claim(&lease.selection())?.close();
    assert!(matches!(
        handle.resolve_native_history_boundary("owner", &owner, plan.selection.clone()).await,
        Err(Error::Lease)
    ));
    assert!(matches!(handle.native_history_capacity("owner", &owner).await, Err(Error::Lease)));
    assert!(matches!(
        handle.apply_native_history_boundary("owner", &owner, Lane::Document, continuation).await,
        Err(Error::Lease)
    ));
    drop((router, handle));
    let (room, _) = Room::open_log_generations(&directory.0.join("source"))?;
    assert_eq!(room.resolve_native_history_boundary("owner", &plan.selection)?, Some(retry));
    let descriptor = room.native_history_descriptor("owner")?;
    assert_eq!(descriptor.document, Family::ContinuedV2);
    assert_eq!(descriptor.review, Some(Family::Original));
    assert_eq!(room.native_history_capacity("owner")?, native_after);
    assert_eq!(
        native_after.document.capacity.checkpoint_bytes.used,
        room.native_history_checkpoint("owner", Lane::Document)?.len()
    );
    let assets = AssetStore::open_retained(&directory.0.join("assets"), room.asset_binding())?;
    assert_eq!(room.storage_capacity(&assets, "owner")?.log, after);
    Ok(())
}

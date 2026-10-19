//! Real HTTP mutation after operational handoff survives a full stop and fresh-auth restart.
use super::{
    live::{authentication, request, start},
    support::{Directory, Result, fill, source},
};
use breditor_collab_relay::{
    OperationalServerRoom, RecoveryRegistrationCredentials, RoomRecoveryPolicy, ServerRoomRecovery,
    assets::asset_id,
    server::{ServerRecoveryCoverage, router_with_server_backups},
};
use image::{DynamicImage, ImageFormat};
use std::io::Cursor;

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn actual_http_upload_reopens_operationally_without_reviving_previous_account_tokens()
-> Result {
    let directory = Directory::new()?;
    let (_, authority, mut rasters) = source(&directory)?;
    fill(&authority, &mut rasters)?;
    let (auth, owner, _) = authentication()?;
    let (source_router, source_handle) = router_with_server_backups(authority, auth, rasters)?;
    let captured = source_handle.capture_recovery_state("owner", &owner).await?;
    let expected = captured.identity();
    let (selected, inventory) = captured.into_parts();
    drop(source_router);
    drop(source_handle);
    let destination = directory.0.join("operational-http");
    let recovered = ServerRoomRecovery::begin(
        &destination,
        &selected,
        &expected.server,
        RoomRecoveryPolicy::HostReacquired,
    )?
    .finish(&selected)?;
    let operational = recovered.begin_operation(
        &selected,
        &expected.server,
        RoomRecoveryPolicy::HostReacquired,
    )?;
    let (authority, rasters) = operational.into_parts();
    let (auth, current_owner, current_reader) = authentication()?;
    let (router, handle) = router_with_server_backups(authority, auth, rasters)?;
    let ServerRecoveryCoverage::Verified(proof) = handle
        .verify_selected_recovery_state(
            "owner",
            &current_owner,
            expected.clone(),
            inventory,
            RecoveryRegistrationCredentials::default(),
        )
        .await?
    else {
        return Err("exact native selected cut".into());
    };
    proof.check_live(&handle, "owner", &current_owner).await?;
    let (address, stop, task) = start(router).await?;
    let mut image = Cursor::new(Vec::new());
    DynamicImage::new_rgb8(7, 8).write_to(&mut image, ImageFormat::Png)?;
    let image = image.into_inner();
    let path = format!("/assets/{}", asset_id(&image));
    assert_eq!(request(address, "PUT", &path, "owner", &current_owner, &image).await?.0, 200);
    assert_eq!(request(address, "GET", &path, "reader", &current_reader, &[]).await?.1, image);
    assert!(
        proof.check_live(&handle, "owner", &current_owner).await.is_err(),
        "Old exact-cut proof does not authorize later operational state"
    );
    stop.send(()).map_err(|()| "stop operational service")?;
    task.await??;
    drop(handle);
    let operational = OperationalServerRoom::resume(
        &destination,
        &selected,
        &expected.server,
        RoomRecoveryPolicy::HostReacquired,
    )?;
    let (authority, rasters) = operational.into_parts();
    assert_eq!(rasters.count(), 4);
    let (auth, _, fresh_reader) = authentication()?;
    let (router, handle) = router_with_server_backups(authority, auth, rasters)?;
    let (address, stop, task) = start(router).await?;
    assert_eq!(request(address, "GET", &path, "reader", &current_reader, &[]).await?.0, 403);
    let (status, bytes) = request(address, "GET", &path, "reader", &fresh_reader, &[]).await?;
    assert_eq!(status, 200);
    assert_eq!(bytes, image);
    stop.send(()).map_err(|()| "stop reopened service")?;
    task.await??;
    drop(handle);
    Ok(())
}

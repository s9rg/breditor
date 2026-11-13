//! Prototype source-capability/fencing tests use actual native storage and authority files.
#[path = "durable/tests.rs"]
mod durable_source_handover;
mod fixture;
mod native_history;
mod network;
mod network_cases;
use super::*;
use crate::{
    Error,
    assets::{AssetStore, asset_id, prepare_asset},
    server::{Authentication, RoomDeploymentAuthority},
};
use fixture::{Directory, TestResult, authentication, source};
use std::{fs, io::Cursor, sync::mpsc, time::Duration};

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn all_ten_actual_generation_hosts_capture_and_seal_exact_sources_without_a_replacement_lease()
-> TestResult {
    for (version, standard) in [(1, false), (2, false), (2, true), (3, false), (3, true)] {
        for atomic in [false, true] {
            let d = Directory::new()?;
            let (room, _) = source(&d, version, standard, atomic, true)?;
            let assets = AssetStore::open(&d.0.join("assets"), room.asset_binding())?;
            let authority =
                RoomDeploymentAuthority::create(&d.authority(), &room.deployment_binding()?)?;
            let lease = authority.claim(&authority.current_selection()?)?;
            let previous = lease.selection();
            let (owner, _) = Authentication::issue_token()?;
            let (reader, _) = Authentication::issue_token()?;
            let (_router, handle) = router_with_log_generation_backups_and_deployment_lease(
                room,
                authentication(&owner, &reader)?,
                assets,
                lease.clone(),
                "owner",
                &owner,
            )
            .await?;
            let expected = handle.capture("owner", &owner).await?;
            let ledger = fs::read(d.authority().join("authority.log"))?;
            assert!(handle.capture("owner", &reader).await.is_err());
            assert!(matches!(handle.capture("reader", &reader).await, Err(Error::Permission)));
            assert!(
                handle
                    .seal_for_handover("reader", &reader, expected.info()?.identity)
                    .await
                    .is_err()
            );
            assert_eq!(fs::read(d.authority().join("authority.log"))?, ledger);
            let sealed =
                handle.seal_for_handover("owner", &owner, expected.info()?.identity).await?;
            assert_eq!(sealed.previous_selection(), &previous);
            assert_eq!(sealed.sealed_selection(), &authority.current_selection()?);
            assert_eq!(sealed.sealed_selection().generation, "2");
            assert_eq!(sealed.backup().to_bytes()?, expected.to_bytes()?);
            assert!(matches!(lease.check(), Err(Error::Lease)));
            assert!(matches!(handle.capture("owner", &owner).await, Err(Error::Lease)));
            assert!(matches!(
                handle.host.transaction(|room| room.register("owner")).await,
                Err(Error::Lease)
            ));
            let backup = sealed.into_backup();
            assert_eq!(backup.to_bytes()?, expected.to_bytes()?);
            assert_eq!(
                fs::metadata(d.authority().join("authority.log"))?.len(),
                ledger.len() as u64 + 104
            );
        }
    }
    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn physical_rotation_and_unreferenced_rasters_stale_selection_at_unchanged_native_counters()
-> TestResult {
    let d = Directory::new()?;
    let (room, _) = source(&d, 3, true, true, true)?;
    let assets = AssetStore::open(&d.0.join("assets"), room.asset_binding())?;
    let authority = RoomDeploymentAuthority::create(&d.authority(), &room.deployment_binding()?)?;
    let lease = authority.claim(&authority.current_selection()?)?;
    let (owner, _) = Authentication::issue_token()?;
    let (reader, _) = Authentication::issue_token()?;
    let (_router, handle) = router_with_log_generation_backups_and_deployment_lease(
        room,
        authentication(&owner, &reader)?,
        assets,
        lease.clone(),
        "owner",
        &owner,
    )
    .await?;
    let capacity = handle.storage_capacity("owner", &owner).await?;
    assert!(matches!(handle.storage_capacity("owner", &reader).await, Err(Error::Permission)));
    assert!(matches!(handle.storage_capacity("reader", &reader).await, Err(Error::Permission)));
    let slots = capacity.log.rotation.ok_or("selected rotation capacity")?;
    assert!(slots.can_rotate);
    let selected = handle.capture("owner", &owner).await?;
    let ledger = fs::read(d.authority().join("authority.log"))?;
    handle.host.transaction(|room| room.rotate_log_generation("owner", "next")).await?;
    let after_rotation = handle.storage_capacity("owner", &owner).await?;
    let remaining = after_rotation.log.rotation.ok_or("rotated capacity")?;
    assert_eq!(remaining.continuation_files_remaining + 1, slots.continuation_files_remaining);
    assert!(!remaining.can_rotate);
    assert_eq!(after_rotation.log.next_sequence, capacity.log.next_sequence);
    assert_eq!(after_rotation.log.terminal_digest, capacity.log.terminal_digest);
    assert!(after_rotation.log.active.records_remaining > capacity.log.active.records_remaining);
    assert_eq!(
        after_rotation.log.retained.framed_bytes_remaining,
        capacity.log.retained.framed_bytes_remaining
    );
    let rotated = handle.capture("owner", &owner).await?;
    assert_eq!(selected.info()?.identity.native.source, rotated.info()?.identity.native.source);
    assert_ne!(selected.info()?.identity, rotated.info()?.identity);
    assert!(matches!(
        handle.seal_for_handover("owner", &owner, selected.info()?.identity).await,
        Err(Error::Contract("generation handover source cut changed"))
    ));
    assert_eq!(fs::read(d.authority().join("authority.log"))?, ledger);
    let mut encoded = Cursor::new(Vec::new());
    image::DynamicImage::new_rgb8(2, 3).write_to(&mut encoded, image::ImageFormat::Png)?;
    let bytes = encoded.into_inner();
    let asset_bytes = bytes.len() as u64;
    let prepared = prepare_asset(&asset_id(&bytes), "image/png", bytes)?;
    let store = handle.host.assets.clone().ok_or("assets")?;
    handle
        .host
        .transaction(move |room| {
            let mut assets = store.lock().map_err(|_| Error::NeedsRecovery)?;
            room.put_asset("owner", &mut assets, prepared)
        })
        .await?;
    let after_upload = handle.storage_capacity("owner", &owner).await?;
    assert_eq!(after_upload.log, after_rotation.log);
    assert_eq!(after_upload.rasters.assets_remaining + 1, after_rotation.rasters.assets_remaining);
    assert_eq!(
        after_upload.rasters.payload_bytes_remaining + asset_bytes,
        after_rotation.rasters.payload_bytes_remaining
    );
    let raster = handle.capture("owner", &owner).await?;
    assert_eq!(rotated.info()?.identity.native, raster.info()?.identity.native);
    assert_ne!(rotated.info()?.identity.assets, raster.info()?.identity.assets);
    assert!(matches!(
        handle.seal_for_handover("owner", &owner, rotated.info()?.identity).await,
        Err(Error::Contract("generation handover source cut changed"))
    ));
    assert_eq!(fs::read(d.authority().join("authority.log"))?, ledger);
    let sealed = handle.seal_for_handover("owner", &owner, raster.info()?.identity).await?;
    assert_eq!(sealed.backup().to_bytes()?, raster.to_bytes()?);
    assert!(matches!(handle.storage_capacity("owner", &owner).await, Err(Error::Lease)));
    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn original_family_cannot_mint_the_live_generation_handle_or_advance_the_epoch() -> TestResult
{
    let d = Directory::new()?;
    let (room, _) = source(&d, 3, true, true, false)?;
    let native = fs::read(d.0.join("original.log"))?;
    let assets = AssetStore::open(&d.0.join("assets"), room.asset_binding())?;
    let capacity = room.storage_capacity(&assets, "owner")?;
    assert_eq!(capacity.log.rotation, None);
    assert_eq!(capacity.log.active, capacity.log.retained);
    assert_eq!(
        capacity.log.active.framed_bytes_remaining + native.len() as u64,
        crate::log::MAX_LOG
    );
    assert_eq!(capacity.rasters.assets_remaining, crate::assets::MAX_ASSETS);
    let unselected = d.0.join("assets/unselected");
    fs::write(&unselected, b"unselected fixture bytes")?;
    assert!(room.storage_capacity(&assets, "owner").is_err());
    assert_eq!(fs::read(&unselected)?, b"unselected fixture bytes");
    fs::remove_file(unselected)?;
    let authority = RoomDeploymentAuthority::create(&d.authority(), &room.deployment_binding()?)?;
    let lease = authority.claim(&authority.current_selection()?)?;
    let selected = lease.selection();
    let ledger = fs::read(d.authority().join("authority.log"))?;
    let (owner, _) = Authentication::issue_token()?;
    let (reader, _) = Authentication::issue_token()?;
    assert!(
        router_with_log_generation_backups_and_deployment_lease(
            room,
            authentication(&owner, &reader)?,
            assets,
            lease,
            "owner",
            &owner
        )
        .await
        .is_err()
    );
    assert_eq!(authority.current_selection()?, selected);
    assert_eq!(fs::read(d.authority().join("authority.log"))?, ledger);
    assert_eq!(fs::read(d.0.join("original.log"))?, native);
    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn actual_in_flight_native_work_excludes_seal_and_later_old_work_cannot_write() -> TestResult
{
    let d = Directory::new()?;
    let (room, _) = source(&d, 3, true, true, true)?;
    let assets = AssetStore::open(&d.0.join("assets"), room.asset_binding())?;
    let authority = RoomDeploymentAuthority::create(&d.authority(), &room.deployment_binding()?)?;
    let lease = authority.claim(&authority.current_selection()?)?;
    let (owner, _) = Authentication::issue_token()?;
    let (reader, _) = Authentication::issue_token()?;
    let (_router, handle) = router_with_log_generation_backups_and_deployment_lease(
        room,
        authentication(&owner, &reader)?,
        assets,
        lease,
        "owner",
        &owner,
    )
    .await?;
    let before = handle.capture("owner", &owner).await?;
    let ledger = fs::read(d.authority().join("authority.log"))?;
    let (entered_tx, entered_rx) = tokio::sync::oneshot::channel();
    let (release_tx, release_rx) = mpsc::channel();
    let host = handle.host.clone();
    let work = tokio::spawn(async move {
        host.transaction(move |room| {
            let _ = entered_tx.send(());
            release_rx.recv().map_err(|_| Error::NeedsRecovery)?;
            room.register("owner")
        })
        .await
    });
    entered_rx.await?;
    assert!(matches!(
        handle.seal_for_handover("owner", &owner, before.info()?.identity).await,
        Err(Error::Locked)
    ));
    assert_eq!(fs::read(d.authority().join("authority.log"))?, ledger);
    release_tx.send(())?;
    work.await??;
    assert!(matches!(
        handle.seal_for_handover("owner", &owner, before.info()?.identity).await,
        Err(Error::Contract("generation handover source cut changed"))
    ));
    let actual = handle.capture("owner", &owner).await?;
    let _sealed = handle.seal_for_handover("owner", &owner, actual.info()?.identity).await?;
    assert!(matches!(
        handle.host.transaction(|room| room.register("owner")).await,
        Err(Error::Lease)
    ));
    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn cancelled_wait_keeps_real_exclusive_fence_worker_alive_until_actual_source_capture_settles()
-> TestResult {
    let d = Directory::new()?;
    let (room, _) = source(&d, 3, true, true, true)?;
    let assets = AssetStore::open(&d.0.join("assets"), room.asset_binding())?;
    let authority = RoomDeploymentAuthority::create(&d.authority(), &room.deployment_binding()?)?;
    let lease = authority.claim(&authority.current_selection()?)?;
    let (owner, _) = Authentication::issue_token()?;
    let (reader, _) = Authentication::issue_token()?;
    let (_router, handle) = router_with_log_generation_backups_and_deployment_lease(
        room,
        authentication(&owner, &reader)?,
        assets,
        lease.clone(),
        "owner",
        &owner,
    )
    .await?;
    let backup = handle.capture("owner", &owner).await?;
    let expected = backup.info()?.identity;
    let observer = RoomDeploymentAuthority::open(&d.authority(), &authority.identity())?;
    let (held_tx, held_rx) = tokio::sync::oneshot::channel();
    let (release_tx, release_rx) = mpsc::channel();
    let room = handle.host.room.clone();
    let blocker = std::thread::spawn(move || {
        let guard = room.lock().expect("source mutex");
        let _ = held_tx.send(());
        let _ = release_rx.recv();
        drop(guard);
    });
    held_rx.await?;
    let copied = handle.clone();
    let token = owner.clone();
    let work = tokio::spawn(async move {
        let deadline = tokio::time::Instant::now() + Duration::from_secs(5);
        loop {
            match copied.seal_for_handover("owner", &token, expected.clone()).await {
                Err(Error::Locked) if tokio::time::Instant::now() < deadline => {
                    tokio::time::sleep(Duration::from_millis(2)).await;
                }
                result => return result,
            }
        }
    });
    let deadline = tokio::time::Instant::now() + Duration::from_secs(5);
    loop {
        if matches!(observer.current_selection(), Err(Error::Locked)) {
            break;
        }
        assert!(tokio::time::Instant::now() < deadline);
        tokio::time::sleep(Duration::from_millis(2)).await;
    }
    work.abort();
    let _ = work.await;
    assert!(matches!(observer.current_selection(), Err(Error::Locked)));
    release_tx.send(())?;
    blocker.join().map_err(|_| "source blocker panic")?;
    let deadline = tokio::time::Instant::now() + Duration::from_secs(5);
    loop {
        match observer.current_selection() {
            Ok(selected) => {
                assert_eq!(selected.generation, "2");
                break;
            }
            Err(Error::Locked) => {}
            other => return Err(format!("unexpected epoch result: {other:?}").into()),
        }
        assert!(tokio::time::Instant::now() < deadline);
        tokio::time::sleep(Duration::from_millis(2)).await;
    }
    assert!(matches!(lease.check(), Err(Error::Lease)));
    let mut room = handle.host.room.lock().map_err(|_| "source room")?;
    let mut assets =
        handle.host.assets.as_ref().ok_or("source assets")?.lock().map_err(|_| "source assets")?;
    assert_eq!(
        crate::ServerLogGenerationRoomBackup::capture(&mut room, &mut assets, "owner")?
            .to_bytes()?,
        backup.to_bytes()?
    );
    Ok(())
}

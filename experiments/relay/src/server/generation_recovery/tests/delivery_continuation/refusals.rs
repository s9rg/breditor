//! Genuine forks, missing rasters, wrong hosts and stale proofs must fail closed.
use super::{
    super::source::{POLICY, Source, TestResult, authentication},
    source,
};
use crate::server::prepare_log_generation_recovery_host;
use crate::{Role, ServerLogGenerationRoomBackup, ServerLogGenerationRoomRecovery};

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn native_or_raster_forks_and_wrong_pins_cannot_be_blessed_by_matching_current_document_clocks()
-> TestResult {
    let seed = Source::new((3, true), true, true, true)?;
    let (handle, owner, reader) = source::host(&seed, "delivery").await?;
    source::middle(&handle).await?;
    let previous = source::capture(&handle, &owner).await?;
    let previous_id = previous.info()?.identity;
    source::advance(&handle, &seed, true, true, true).await?;
    let proof = source::proof(&handle, &owner, &seed).await?;
    let mut wrong = previous_id.clone();
    wrong.archive_sha256[0] ^= 1;
    assert!(
        handle
            .verify_delivery_continuation(
                "owner",
                &owner,
                source::copy(&previous)?,
                &wrong,
                proof.clone()
            )
            .await
            .is_err()
    );
    assert!(
        handle
            .verify_delivery_continuation(
                "owner",
                "wrong",
                source::copy(&previous)?,
                &previous_id,
                proof.clone()
            )
            .await
            .is_err()
    );
    assert!(
        handle
            .verify_delivery_continuation(
                "reader",
                &reader,
                source::copy(&previous)?,
                &previous_id,
                proof.clone()
            )
            .await
            .is_err()
    );
    let mut fork = seed.operation("fork-native")?;
    let (room, assets) = fork.components_mut();
    room.grant("owner", "fork-reader", Some(Role::Reader))?;
    room.rotate_log_generation("owner", "delivery-middle")?;
    let different = ServerLogGenerationRoomBackup::capture(room, assets, "owner")?;
    different.check_archive_ancestor(&seed.original)?;
    assert_ne!(different.info()?.identity, previous_id);
    let selected = different.info()?.identity;
    assert!(
        handle
            .verify_delivery_continuation("owner", &owner, different, &selected, proof.clone())
            .await
            .is_err()
    );
    let selected = previous_id.clone();
    let mut fork = ServerLogGenerationRoomRecovery::begin(
        &seed.directory.0.join("fork-raster"),
        &previous,
        &selected,
        POLICY,
    )?
    .finish(&previous)?
    .begin_operation(&previous, &selected, POLICY, "owner")?;
    let (room, assets) = fork.components_mut();
    let bytes = source::png(7, 8)?;
    room.put_asset(
        "owner",
        assets,
        crate::assets::prepare_asset(&crate::assets::asset_id(&bytes), "image/png", bytes)?,
    )?;
    let different = ServerLogGenerationRoomBackup::capture(room, assets, "owner")?;
    assert_eq!(different.info()?.identity.native, previous_id.native);
    different.check_archive_ancestor(&previous)?;
    let selected = different.info()?.identity;
    assert!(
        handle
            .verify_delivery_continuation("owner", &owner, different, &selected, proof)
            .await
            .is_err()
    );
    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn restore_origin_is_not_relabelled_as_an_older_previous_and_other_live_hosts_cannot_lend_proofs()
-> TestResult {
    let seed = Source::new((3, true), true, true, true)?;
    let (handle, owner, _) = source::host(&seed, "delivery").await?;
    source::middle(&handle).await?;
    let previous = source::capture(&handle, &owner).await?;
    let proof = source::proof(&handle, &owner, &seed).await?;
    let (other, other_owner, _) = source::host(&seed, "other-live").await?;
    assert!(
        other
            .verify_delivery_continuation(
                "owner",
                &other_owner,
                seed.original_copy()?,
                &seed.original.info()?.identity,
                proof
            )
            .await
            .is_err()
    );
    let selected = previous.info()?.identity;
    let operation = ServerLogGenerationRoomRecovery::begin(
        &seed.directory.0.join("new-origin"),
        &previous,
        &selected,
        POLICY,
    )?
    .finish(&previous)?
    .begin_operation(&previous, &selected, POLICY, "owner")?;
    let (auth, token, _) = authentication()?;
    let newer = Box::pin(prepare_log_generation_recovery_host(
        operation,
        auth,
        source::copy(&previous)?,
        &selected,
        "owner",
        &token,
    ))
    .await?;
    let current = source::proof(&newer, &token, &seed).await?;
    assert!(
        newer
            .verify_delivery_continuation(
                "owner",
                &token,
                seed.original_copy()?,
                &seed.original.info()?.identity,
                current
            )
            .await
            .is_err()
    );
    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn raster_only_growth_stales_the_exact_proof_and_requires_a_fresh_full_transition()
-> TestResult {
    let seed = Source::new((3, true), true, true, true)?;
    let (handle, owner, _) = source::host(&seed, "delivery").await?;
    source::middle(&handle).await?;
    let previous = source::capture(&handle, &owner).await?;
    let selected = previous.info()?.identity;
    let current = source::proof(&handle, &owner, &seed).await?;
    let proof = handle
        .verify_delivery_continuation("owner", &owner, source::copy(&previous)?, &selected, current)
        .await?;
    let before = proof.identity();
    let assets = handle.host.assets.clone().ok_or("actual raster store")?;
    let bytes = source::png(9, 10)?;
    handle
        .host
        .transaction(move |room| {
            let mut assets = assets.lock().map_err(|_| crate::Error::NeedsRecovery)?;
            room.put_asset(
                "owner",
                &mut assets,
                crate::assets::prepare_asset(&crate::assets::asset_id(&bytes), "image/png", bytes)?,
            )?;
            Ok(())
        })
        .await?;
    assert!(proof.check_live(&handle, "owner", &owner).await.is_err());
    let current = source::proof(&handle, &owner, &seed).await?;
    let fresh = handle
        .verify_delivery_continuation("owner", &owner, source::copy(&previous)?, &selected, current)
        .await?;
    assert_eq!(fresh.identity().current.server.native, before.current.server.native);
    assert_ne!(fresh.identity().current.server.assets, before.current.server.assets);
    fresh.check_live(&handle, "owner", &owner).await?;
    Ok(())
}

//! Invisible physical/raster changes and all current native registrations stale old proofs.
use super::{
    super::source::TestResult,
    fixture::{PhysicalSource, add_raster},
};
use crate::{Error, RecoveryDocumentCredential, server::PhysicalServerRoomRecoveryCoverage};

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn physical_only_rotation_stales_proof_with_equal_native_logical_identity() -> TestResult {
    let source = PhysicalSource::new((3, true), true, true, true)?;
    let (handle, local, owner, _) = source.paired_host("physical-stale").await?;
    // Make the next active generation nonempty before capturing the proof.
    local.host.transaction(|room| room.grant("owner", "reader", Some(crate::Role::Reader))).await?;
    let state = handle.capture_recovery_state("owner", &owner).await?;
    let before = state.identity()?;
    let (_, inventory) = state.into_parts();
    let PhysicalServerRoomRecoveryCoverage::Verified(proof) = handle
        .verify_selected_recovery_state(
            "owner",
            &owner,
            before.clone(),
            inventory,
            source.source.protected_records(),
        )
        .await?
    else {
        return Err("complete credentials did not verify".into());
    };
    local
        .host
        .transaction(|room| room.rotate_log_generation("owner", "later-physical-only").map(|_| ()))
        .await?;
    let after = handle.capture_recovery_state("owner", &owner).await?.identity()?;
    assert_eq!(before.ancestor, after.ancestor);
    assert_eq!(before.local_origin, after.local_origin);
    assert_eq!(before.server.native.source, after.server.native.source);
    assert_eq!(before.server.assets, after.server.assets);
    assert_ne!(before.server.native.manifest, after.server.native.manifest);
    assert!(proof.check_live(&handle, "owner", &owner).await.is_err());
    let assets = handle.capture_asset_recovery_state("owner", &owner).await?;
    assert_eq!(assets.current, after);
    assert_eq!(assets.references.source, after.server.native);
    assert_eq!(assets.format, "breditor/physical-server-asset-recovery-state");
    assert_eq!(assets.format_version, 1);
    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn raster_only_addition_stales_proof_with_equal_native_physical_cut() -> TestResult {
    let source = PhysicalSource::new((3, true), true, true, true)?;
    let (handle, local, owner, _) = source.paired_host("raster-stale").await?;
    let state = handle.capture_recovery_state("owner", &owner).await?;
    let before = state.identity()?;
    let (_, inventory) = state.into_parts();
    let PhysicalServerRoomRecoveryCoverage::Verified(proof) = handle
        .verify_selected_recovery_state(
            "owner",
            &owner,
            before.clone(),
            inventory,
            source.source.protected_records(),
        )
        .await?
    else {
        return Err("complete credentials did not verify".into());
    };
    let assets = local.host.assets.clone().ok_or("actual raster owner")?;
    local
        .host
        .transaction(move |room| {
            let mut assets = assets.lock().map_err(|_| Error::NeedsRecovery)?;
            add_raster(room, &mut assets, 7)
        })
        .await?;
    let after = handle.capture_asset_recovery_state("owner", &owner).await?;
    assert_eq!(before.server.native, after.current.server.native);
    assert_eq!(before.participants, after.current.participants);
    assert_eq!(before.ancestor, after.current.ancestor);
    assert_eq!(before.local_origin, after.current.local_origin);
    assert_ne!(before.server.assets, after.current.server.assets);
    assert!(proof.check_live(&handle, "owner", &owner).await.is_err());
    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn later_registration_requires_new_secret_without_dropping_revoked_or_observer_streams()
-> TestResult {
    let source = PhysicalSource::new((3, true), true, true, true)?;
    let (handle, local, owner, _) = source.paired_host("registration-stale").await?;
    let state = handle.capture_recovery_state("owner", &owner).await?;
    let expected = state.identity()?;
    let (_, inventory) = state.into_parts();
    let PhysicalServerRoomRecoveryCoverage::Verified(proof) = handle
        .verify_selected_recovery_state(
            "owner",
            &owner,
            expected,
            inventory,
            source.source.protected_records(),
        )
        .await?
    else {
        return Err("complete credentials did not verify".into());
    };
    let registration = local.host.transaction(|room| room.register("owner")).await?;
    assert!(proof.check_live(&handle, "owner", &owner).await.is_err());
    let state = handle.capture_recovery_state("owner", &owner).await?;
    let expected = state.identity()?;
    let (_, inventory) = state.into_parts();
    let PhysicalServerRoomRecoveryCoverage::Pending { missing } = handle
        .verify_selected_recovery_state(
            "owner",
            &owner,
            expected.clone(),
            inventory.clone(),
            source.source.protected_records(),
        )
        .await?
    else {
        return Err("missing current credential produced proof".into());
    };
    assert_eq!(missing.len(), 1);
    let mut credentials = source.source.protected_records();
    credentials.documents.push(RecoveryDocumentCredential {
        principal: "owner".into(),
        writer: registration.lease.writer,
        credential: registration.credential,
    });
    let PhysicalServerRoomRecoveryCoverage::Verified(proof) = handle
        .verify_selected_recovery_state("owner", &owner, expected, inventory, credentials)
        .await?
    else {
        return Err("complete current credentials did not verify".into());
    };
    proof.check_live(&handle, "owner", &owner).await?;
    Ok(())
}

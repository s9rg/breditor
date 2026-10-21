//! Current host account credentials and protected native resume records have different authority.
use super::super::{ServerLogGenerationRecoveryCoverage, prepare_log_generation_recovery_host};
use super::source::{Source, TestResult, authentication};
use crate::{Error, MissingRecoveryRegistration, RecoveryRegistrationCredentials};

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn current_auth_all_revoked_and_observer_secrets_are_required_without_reviving_leases()
-> TestResult {
    let source = Source::new((3, true), true, true, true)?;
    let operation = source.operation("recovered")?;
    let (auth, owner, reader) = authentication()?;
    let handle = prepare_log_generation_recovery_host(
        operation,
        auth,
        source.original_copy()?,
        &source.original.info()?.identity,
        "owner",
        &owner,
    )
    .await?;
    assert!(matches!(
        handle.capture_recovery_state("owner", &reader).await,
        Err(Error::Permission)
    ));
    assert!(matches!(
        handle.capture_recovery_state("reader", &reader).await,
        Err(Error::Permission)
    ));
    let state = handle.capture_recovery_state("owner", &owner).await?;
    let expected = state.identity()?;
    let (backup, inventory) = state.into_parts();
    assert_eq!(expected.server, backup.info()?.identity);
    assert_eq!(expected.participants.source, expected.server.native);
    let ServerLogGenerationRecoveryCoverage::Pending { missing } = handle
        .verify_selected_recovery_state(
            "owner",
            &owner,
            expected.clone(),
            inventory.clone(),
            RecoveryRegistrationCredentials::default(),
        )
        .await?
    else {
        return Err("missing protected input produced a proof".into());
    };
    assert_eq!(missing.len(), 6);
    assert!(missing.iter().any(|item| matches!(item, MissingRecoveryRegistration::Document { principal, .. } if principal == "revoked")));
    assert!(missing.iter().any(|item| matches!(item, MissingRecoveryRegistration::Review { principal, .. } if principal == "reader")));
    let mut wrong = source.protected_records();
    wrong.documents[0].credential = owner.clone();
    assert!(
        handle
            .verify_selected_recovery_state(
                "owner",
                &owner,
                expected.clone(),
                inventory.clone(),
                wrong
            )
            .await
            .is_err()
    );
    let ServerLogGenerationRecoveryCoverage::Verified(proof) = handle
        .verify_selected_recovery_state(
            "owner",
            &owner,
            expected.clone(),
            inventory,
            source.protected_records(),
        )
        .await?
    else {
        return Err("full protected input missing".into());
    };
    assert_eq!(proof.identity(), expected);
    proof.check_live(&handle, "owner", &owner).await?;
    let original_lease = source.author.lease.clone();
    handle
        .host
        .transaction(move |room| {
            assert!(room.validate_lease("owner", &original_lease).is_err());
            assert!(room.catchup("revoked").is_err());
            Ok(())
        })
        .await?;
    proof.check_live(&handle, "owner", &owner).await?;
    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn proofs_are_host_local_weak_and_stale_after_physical_only_rotation() -> TestResult {
    let source = Source::new((3, true), true, true, true)?;
    let (auth, owner, _) = authentication()?;
    let handle = prepare_log_generation_recovery_host(
        source.operation("one")?,
        auth,
        source.original_copy()?,
        &source.original.info()?.identity,
        "owner",
        &owner,
    )
    .await?;
    let state = handle.capture_recovery_state("owner", &owner).await?;
    let expected = state.identity()?;
    let (_, inventory) = state.into_parts();
    let ServerLogGenerationRecoveryCoverage::Verified(proof) = handle
        .verify_selected_recovery_state(
            "owner",
            &owner,
            expected.clone(),
            inventory,
            source.protected_records(),
        )
        .await?
    else {
        return Err("full protected input".into());
    };
    handle
        .host
        .transaction(|room| {
            room.rotate_log_generation("owner", "physical-only")?;
            Ok(())
        })
        .await?;
    let current = handle.capture_recovery_state("owner", &owner).await?.identity()?;
    assert_eq!(current.server.native.source, expected.server.native.source);
    assert_ne!(current.server.native.manifest, expected.server.native.manifest);
    assert!(proof.check_live(&handle, "owner", &owner).await.is_err());
    let state = handle.capture_recovery_state("owner", &owner).await?;
    let current = state.identity()?;
    let (_, inventory) = state.into_parts();
    let ServerLogGenerationRecoveryCoverage::Verified(proof) = handle
        .verify_selected_recovery_state(
            "owner",
            &owner,
            current,
            inventory,
            source.protected_records(),
        )
        .await?
    else {
        return Err("current protected input".into());
    };
    let (other_auth, other_owner, _) = authentication()?;
    let other = prepare_log_generation_recovery_host(
        source.operation("two")?,
        other_auth,
        source.original_copy()?,
        &source.original.info()?.identity,
        "owner",
        &other_owner,
    )
    .await?;
    assert!(proof.check_live(&other, "owner", &other_owner).await.is_err());
    let weak = std::sync::Arc::downgrade(&handle.host.room);
    drop(handle);
    assert!(weak.upgrade().is_none());
    assert!(proof.check_live(&other, "owner", &other_owner).await.is_err());
    Ok(())
}

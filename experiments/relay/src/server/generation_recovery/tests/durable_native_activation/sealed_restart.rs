//! Production sealed restart verification preserves both the selected room and its epoch.
use super::{prepare, reopen};
use crate::{
    Error, RecoveryRegistrationCredentials, Role,
    server::{
        NativeGenerationActivationCheckpointStatus as Status, SealedNativeRestartHostCoverage,
        SealedNativeRestartSelection, ServerLogGenerationRecoveryCoverage as Coverage,
        generation_recovery::tests::{native_activation::Setup, source::TestResult},
        open_sealed_native_restart_host,
    },
};
use std::fs;

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn prepared_sealed_restart_requires_the_exact_cut_and_all_protected_credentials() -> TestResult
{
    let setup = Box::pin(Setup::new((3, true), true, (true, true), true)).await?;
    let original = setup.proof().await?;
    let checkpoint = prepare(&setup, "sealed-prepared", &original).await?;
    let selected = |status| SealedNativeRestartSelection {
        checkpoint: checkpoint.clone(),
        authority: setup.authority.clone(),
        status,
        expected: original.identity(),
    };
    let before = setup.ledger()?;
    let pending = setup
        .handle
        .verify_sealed_native_restart(
            "owner",
            &setup.owner,
            selected(Status::Prepared),
            RecoveryRegistrationCredentials::default(),
        )
        .await?;
    assert!(matches!(pending, Coverage::Pending { missing } if !missing.is_empty()));
    let verified = setup
        .handle
        .verify_sealed_native_restart(
            "owner",
            &setup.owner,
            selected(Status::Prepared),
            setup.source.protected_records(),
        )
        .await?;
    assert!(
        matches!(verified, Coverage::Verified(proof) if proof.identity() == original.identity())
    );
    assert!(matches!(
        setup
            .handle
            .verify_sealed_native_restart(
                "owner",
                &setup.owner,
                selected(Status::Committed),
                setup.source.protected_records(),
            )
            .await,
        Err(Error::Lease)
    ));
    assert!(
        setup
            .handle
            .verify_sealed_native_restart(
                "owner",
                &setup.reader,
                selected(Status::Prepared),
                setup.source.protected_records(),
            )
            .await
            .is_err()
    );
    assert_eq!(setup.ledger()?, before);
    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn committed_sealed_restart_checks_advanced_current_state_and_same_operational_owner()
-> TestResult {
    let setup = Box::pin(Setup::new((3, true), true, (true, true), true)).await?;
    let original = setup.proof().await?;
    let checkpoint = prepare(&setup, "sealed-committed", &original).await?;
    let active = setup
        .handle
        .activate_durable_native_service(
            "owner",
            &setup.owner,
            setup.authority.clone(),
            checkpoint.clone(),
            original,
            checkpoint.identity().clone(),
        )
        .await?;
    active
        .recovery_host()
        .host
        .transaction(|room| room.grant("owner", "accepted-after-activation", Some(Role::Reader)))
        .await?;
    let current = setup.handle.capture_recovery_state("owner", &setup.owner).await?.identity()?;
    assert_ne!(current, *checkpoint.identity().current());
    let intent_file = checkpoint.root().join("activation.json");
    let intent_bytes = fs::read(&intent_file)?;
    let before = setup.ledger()?;

    drop(active);
    drop(setup.handle);
    let (reopened, owner) =
        Box::pin(reopen(&setup.source, &setup.source.directory.0.join("target"))).await?;
    let selected = |expected| SealedNativeRestartSelection {
        checkpoint: checkpoint.clone(),
        authority: setup.authority.clone(),
        status: Status::Committed,
        expected,
    };
    assert!(matches!(
        reopened
            .verify_sealed_native_restart(
                "owner",
                &owner,
                selected(checkpoint.identity().current().clone()),
                setup.source.protected_records(),
            )
            .await,
        Err(Error::Contract("sealed restart current cut differs"))
    ));
    let verified = reopened
        .verify_sealed_native_restart(
            "owner",
            &owner,
            selected(current.clone()),
            setup.source.protected_records(),
        )
        .await?;
    assert!(matches!(verified, Coverage::Verified(proof) if proof.identity() == current));

    let (auth, other_owner, _) = super::authentication()?;
    let other = crate::server::prepare_log_generation_recovery_host(
        setup.source.operation("unrelated-operation")?,
        auth,
        setup.source.original_copy()?,
        &setup.source.original.info()?.identity,
        "owner",
        &other_owner,
    )
    .await?;
    let other_cut = other.capture_recovery_state("owner", &other_owner).await?.identity()?;
    assert!(matches!(
        other
            .verify_sealed_native_restart(
                "owner",
                &other_owner,
                selected(other_cut),
                setup.source.protected_records(),
            )
            .await,
        Err(Error::Contract("sealed restart operational owner differs"))
    ));
    assert_eq!(fs::read(intent_file)?, intent_bytes);
    assert_eq!(fs::read(setup.source.directory.0.join("authority/authority.log"))?, before);
    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn sealed_restart_open_releases_custody_when_protected_inputs_are_pending() -> TestResult {
    let setup = Box::pin(Setup::new((3, true), true, (true, true), true)).await?;
    let original = setup.proof().await?;
    let checkpoint = prepare(&setup, "sealed-open", &original).await?;
    let root = setup.source.directory.0.join("target");
    let marker = fs::read(root.join(".operational.json"))?;
    drop(setup.handle);
    let selected = || SealedNativeRestartSelection {
        checkpoint: checkpoint.clone(),
        authority: setup.authority.clone(),
        status: Status::Prepared,
        expected: original.identity(),
    };
    let (auth, owner, _) = super::authentication()?;
    let pending = open_sealed_native_restart_host(
        &root,
        auth,
        "owner",
        &owner,
        selected(),
        RecoveryRegistrationCredentials::default(),
    )
    .await?;
    assert!(
        matches!(pending, SealedNativeRestartHostCoverage::Pending { missing } if !missing.is_empty())
    );
    let (auth, owner, _) = super::authentication()?;
    let opened = open_sealed_native_restart_host(
        &root,
        auth,
        "owner",
        &owner,
        selected(),
        setup.source.protected_records(),
    )
    .await?;
    let SealedNativeRestartHostCoverage::Verified { host, proof } = opened else {
        return Err("all protected records supplied".into());
    };
    assert_eq!(proof.identity(), original.identity());
    proof.check_live(&host, "owner", &owner).await?;
    assert_eq!(fs::read(root.join(".operational.json"))?, marker);
    assert_eq!(checkpoint.status(&setup.authority)?, Status::Prepared);
    Ok(())
}

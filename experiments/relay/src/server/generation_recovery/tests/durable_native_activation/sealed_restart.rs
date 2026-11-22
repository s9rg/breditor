//! Production sealed restart verification preserves both the selected room and its epoch.
use super::{faults::captured_files, prepare, reopen};
use crate::{
    Error, RecoveryRegistrationCredentials, Role, ServerLogGenerationRoomBackup,
    server::{
        NativeGenerationActivationCheckpointStatus as Status, SealedNativeRestartBootstrap,
        SealedNativeRestartHostCoverage, SealedNativeRestartSelection,
        ServerLogGenerationRecoveryCoverage as Coverage,
        generation_recovery::tests::{native_activation::Setup, source::TestResult},
        inspect_sealed_native_restart, open_sealed_native_restart_host,
    },
};
use std::{
    fs,
    path::{Path, PathBuf},
};

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
    let other = Box::pin(crate::server::prepare_log_generation_recovery_host(
        setup.source.operation("unrelated-operation")?,
        auth,
        setup.source.original_copy()?,
        &setup.source.original.info()?.identity,
        "owner",
        &other_owner,
    ))
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

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn cold_bootstrap_releases_every_opened_owner_on_pending_and_refuses_superseded_epochs()
-> TestResult {
    use crate::server::{
        SealedNativeRestartBootstrap, SealedNativeRestartBootstrapCoverage as BootstrapCoverage,
        reopen_sealed_native_restart_host,
    };
    let setup = Box::pin(Setup::new((3, true), true, (true, true), true)).await?;
    let verified = setup.proof().await?;
    let checkpoint = prepare(&setup, "sealed-bootstrap", &verified).await?;
    let source_root = setup.intent.root().to_owned();
    let checkpoint_root = checkpoint.root().to_owned();
    let authority_root = setup.source.directory.0.join("authority");
    let operational_root = setup.source.directory.0.join("target");
    let expected_checkpoint = checkpoint.identity().clone();
    let expected_current = verified.identity();
    let checkpoint_bytes = fs::read(checkpoint_root.join("activation.json"))?;
    let target_bytes = fs::read(operational_root.join(".operational.json"))?;
    let epoch = setup.authority.current_selection()?;
    let ledger = setup.ledger()?;
    drop(checkpoint);
    drop(setup.intent);
    drop(setup.handle);
    let bootstrap = || SealedNativeRestartBootstrap {
        source_root: source_root.clone(),
        checkpoint_root: checkpoint_root.clone(),
        authority_root: authority_root.clone(),
        operational_root: operational_root.clone(),
        expected_checkpoint: expected_checkpoint.clone(),
        expected_current: expected_current.clone(),
    };
    let (auth, _, reader) = super::authentication()?;
    let mut missing_path = bootstrap();
    missing_path.source_root = source_root.join("absent");
    assert!(matches!(
        Box::pin(reopen_sealed_native_restart_host(
            missing_path,
            auth,
            "owner",
            &reader,
            setup.source.protected_records(),
        ))
        .await,
        Err(Error::Permission)
    ));
    let (auth, owner, _) = super::authentication()?;
    let pending = Box::pin(reopen_sealed_native_restart_host(
        bootstrap(),
        auth,
        "owner",
        &owner,
        RecoveryRegistrationCredentials::default(),
    ))
    .await?;
    assert!(matches!(pending, BootstrapCoverage::Pending { missing } if !missing.is_empty()));
    let (auth, owner, _) = super::authentication()?;
    let opened = Box::pin(reopen_sealed_native_restart_host(
        bootstrap(),
        auth,
        "owner",
        &owner,
        setup.source.protected_records(),
    ))
    .await?;
    let BootstrapCoverage::Verified(opened) = opened else {
        return Err("exact pinned bootstrap remains pending".into());
    };
    assert_eq!(opened.status, Status::Prepared);
    assert_eq!(opened.checkpoint.identity(), &expected_checkpoint);
    assert_eq!(opened.source.identity(), expected_checkpoint.source());
    assert_eq!(opened.authority.current_selection()?, epoch);
    assert_eq!(opened.proof.identity(), expected_current);
    opened.proof.check_live(&opened.host, "owner", &owner).await?;
    assert_eq!(fs::read(authority_root.join("authority.log"))?, ledger);
    assert_eq!(fs::read(checkpoint_root.join("activation.json"))?, checkpoint_bytes);
    assert_eq!(fs::read(operational_root.join(".operational.json"))?, target_bytes);
    drop(opened);
    let _contender = setup.authority.claim(&epoch)?;
    let changed = fs::read(authority_root.join("authority.log"))?;
    let (auth, owner, _) = super::authentication()?;
    assert!(matches!(
        Box::pin(reopen_sealed_native_restart_host(
            bootstrap(),
            auth,
            "owner",
            &owner,
            setup.source.protected_records(),
        ))
        .await,
        Err(Error::Lease)
    ));
    assert_eq!(fs::read(authority_root.join("authority.log"))?, changed);
    assert_eq!(fs::read(checkpoint_root.join("activation.json"))?, checkpoint_bytes);
    assert_eq!(fs::read(operational_root.join(".operational.json"))?, target_bytes);
    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn sealed_inspection_returns_unpinned_accepted_descendant_and_requires_retained_floor()
-> TestResult {
    let setup = Box::pin(Setup::new((3, true), true, (true, true), true)).await?;
    let proof = setup.proof().await?;
    let checkpoint = prepare(&setup, "sealed-inspection", &proof).await?;
    let expected_checkpoint = checkpoint.identity().clone();
    let checkpoint_cut = expected_checkpoint.current().clone();
    let operational_root = setup.source.directory.0.join("target");
    let native_marker: serde_json::Value =
        serde_json::from_slice(&fs::read(operational_root.join(".native.json"))?)?;
    let native_root = operational_root
        .join(native_marker["directory"].as_str().ok_or("actual operational native directory")?);
    let mut checkpoint_files = captured_files(&native_root)?;
    checkpoint_files.sort();
    let active = setup
        .handle
        .activate_durable_native_service(
            "owner",
            &setup.owner,
            setup.authority.clone(),
            checkpoint.clone(),
            proof,
            expected_checkpoint.clone(),
        )
        .await?;
    active
        .recovery_host()
        .host
        .transaction(|room| room.grant("owner", "accepted-before-lost-pin", Some(Role::Reader)))
        .await?;
    let actual = setup.handle.capture_recovery_state("owner", &setup.owner).await?.identity()?;
    assert_ne!(actual, checkpoint_cut);
    let source_root = setup.intent.root().to_owned();
    let checkpoint_root = checkpoint.root().to_owned();
    let authority_root = setup.source.directory.0.join("authority");
    let ledger = setup.ledger()?;
    let intent_bytes = fs::read(checkpoint_root.join("activation.json"))?;
    let target_bytes = fs::read(operational_root.join(".operational.json"))?;
    drop(active);
    drop(setup.handle);
    drop(checkpoint);
    drop(setup.intent);
    let bootstrap = |expected_current| SealedNativeRestartBootstrap {
        source_root: source_root.clone(),
        checkpoint_root: checkpoint_root.clone(),
        authority_root: authority_root.clone(),
        operational_root: operational_root.clone(),
        expected_checkpoint: expected_checkpoint.clone(),
        expected_current,
    };
    let (auth, owner, _) = super::authentication()?;
    let observed = Box::pin(inspect_sealed_native_restart(
        bootstrap(checkpoint_cut.clone()),
        None,
        auth,
        "owner",
        &owner,
    ))
    .await?;
    assert_eq!(observed.identity()?, actual);
    let (archive, _) = observed.into_parts();
    let (auth, owner, _) = super::authentication()?;
    assert!(matches!(
        Box::pin(inspect_sealed_native_restart(
            bootstrap(actual.clone()),
            None,
            auth,
            "owner",
            &owner,
        ))
        .await,
        Err(Error::Contract("sealed inspection minimum archive differs"))
    ));
    let (auth, owner, _) = super::authentication()?;
    let observed = Box::pin(inspect_sealed_native_restart(
        bootstrap(actual.clone()),
        Some(archive),
        auth,
        "owner",
        &owner,
    ))
    .await?;
    assert_eq!(observed.identity()?, actual);
    let (later_archive, _) = observed.into_parts();

    assert_retained_floor_refuses_rollback(
        bootstrap(actual),
        bootstrap(checkpoint_cut),
        later_archive,
        &native_root,
        &checkpoint_files,
    )
    .await?;
    assert_eq!(fs::read(authority_root.join("authority.log"))?, ledger);
    assert_eq!(fs::read(checkpoint_root.join("activation.json"))?, intent_bytes);
    assert_eq!(fs::read(operational_root.join(".operational.json"))?, target_bytes);
    Ok(())
}

async fn assert_retained_floor_refuses_rollback(
    newer: SealedNativeRestartBootstrap,
    older: SealedNativeRestartBootstrap,
    later_archive: ServerLogGenerationRoomBackup,
    native_root: &Path,
    checkpoint_files: &[(PathBuf, Vec<u8>)],
) -> TestResult {
    // Reproduce a complete earlier log in the same closed operational
    // directory. The retained later archive must expose the lost append.
    for (path, bytes) in checkpoint_files {
        fs::write(path, bytes)?;
    }
    let (auth, owner, _) = super::authentication()?;
    assert!(matches!(
        Box::pin(inspect_sealed_native_restart(newer, Some(later_archive), auth, "owner", &owner,))
            .await,
        Err(Error::Contract("archive ancestor is not in local physical lineage"))
    ));
    let (auth, owner, _) = super::authentication()?;
    let checkpoint_cut = older.expected_current.clone();
    let older_cut =
        Box::pin(inspect_sealed_native_restart(older, None, auth, "owner", &owner)).await?;
    assert_eq!(older_cut.identity()?, checkpoint_cut);
    let mut actual_files = captured_files(native_root)?;
    actual_files.sort();
    assert_eq!(actual_files.as_slice(), checkpoint_files);
    Ok(())
}

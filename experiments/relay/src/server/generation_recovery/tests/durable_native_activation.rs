//! Genuine durable target custody, fresh cold epochs and exact whole-history retention.
use super::{
    native_activation::Setup,
    source::{POLICY, Source, TestResult, authentication},
};
use crate::{
    Error, OperationalLogGenerationServerRoom,
    server::{
        NativeGenerationActivationCheckpointStatus as Status,
        NativeGenerationActivationPrepareOptions as Options, PreparedLogGenerationRecoveryHost,
        PreparedNativeGenerationActivation as Prepared,
        PreparedNativeGenerationActivationIdentity as Identity,
        ServerLogGenerationRecoveryCoverage, VerifiedServerLogGenerationRecoveryState,
        prepare_log_generation_recovery_host,
    },
};
use std::{fs, path::Path, sync::Arc};
async fn proof(
    handle: &PreparedLogGenerationRecoveryHost,
    owner: &str,
    source: &Source,
) -> TestResult<VerifiedServerLogGenerationRecoveryState> {
    let state = handle.capture_recovery_state("owner", owner).await?;
    let id = state.identity()?;
    let (_, inventory) = state.into_parts();
    match handle
        .verify_selected_recovery_state("owner", owner, id, inventory, source.protected_records())
        .await?
    {
        ServerLogGenerationRecoveryCoverage::Verified(p) => Ok(p),
        ServerLogGenerationRecoveryCoverage::Pending { .. } => Err("credentials missing".into()),
    }
}
async fn reopen(
    source: &Source,
    path: &Path,
) -> TestResult<(PreparedLogGenerationRecoveryHost, String)> {
    let operation = OperationalLogGenerationServerRoom::resume(
        path,
        &source.original,
        &source.original.info()?.identity,
        POLICY,
        "owner",
    )?;
    let (auth, owner, _) = authentication()?;
    let handle = prepare_log_generation_recovery_host(
        operation,
        auth,
        source.original_copy()?,
        &source.original.info()?.identity,
        "owner",
        &owner,
    )
    .await?;
    Ok((handle, owner))
}
async fn prepare(
    setup: &Setup,
    name: &str,
    p: &VerifiedServerLogGenerationRecoveryState,
) -> TestResult<Arc<Prepared>> {
    Ok(Arc::new(
        setup
            .handle
            .prepare_durable_native_activation(
                "owner",
                &setup.owner,
                setup.intent.clone(),
                p,
                Options {
                    root: setup.source.directory.0.join(name),
                    authority: setup.authority.clone(),
                },
            )
            .await?,
    ))
}
async fn workflow(profile: (u32, bool), atomic: bool, history: (bool, bool)) -> TestResult {
    let setup = Box::pin(Setup::new(profile, atomic, history, true)).await?;
    let p = setup.proof().await?;
    let prepared = prepare(&setup, "checkpoint-one", &p).await?;
    let first = prepared.identity().clone();
    let root = prepared.root().to_owned();
    assert_eq!(prepared.status(&setup.authority)?, Status::Prepared);
    let before = setup.ledger()?;
    let active = setup
        .handle
        .activate_durable_native_service(
            "owner",
            &setup.owner,
            setup.authority.clone(),
            prepared.clone(),
            p,
            first.clone(),
        )
        .await?;
    assert_eq!(setup.ledger()?.len(), before.len() + 104);
    assert_eq!(active.selection(), first.planned_selection());
    active
        .recovery_host()
        .host
        .transaction(|room| {
            room.grant("owner", "accepted-after-checkpoint", Some(crate::Role::Reader))?;
            Ok(())
        })
        .await?;
    let current =
        active.recovery_host().capture_recovery_state("owner", &setup.owner).await?.identity()?;
    assert_ne!(current.server, first.current().server);
    let router = active.router();
    drop(active);
    drop(setup.handle);
    drop(prepared);
    assert!(matches!(Prepared::open(&root, &first, setup.intent.clone()), Err(Error::Locked)));
    drop(router);
    let recovered = Arc::new(Prepared::open(&root, &roundtrip(&first)?, setup.intent.clone())?);
    assert_eq!(recovered.status(&setup.authority)?, Status::Committed);
    let (handle, owner) =
        Box::pin(reopen(&setup.source, &setup.source.directory.0.join("target"))).await?;
    let p = proof(&handle, &owner, &setup.source).await?;
    assert_eq!(p.identity(), current);
    assert!(
        handle
            .activate_durable_native_service(
                "owner",
                &owner,
                setup.authority.clone(),
                recovered.clone(),
                p,
                first.clone()
            )
            .await
            .is_err()
    );
    let p = proof(&handle, &owner, &setup.source).await?;
    let next = Arc::new(
        handle
            .prepare_durable_native_restart(
                "owner",
                &owner,
                recovered.clone(),
                &p,
                Options {
                    root: setup.source.directory.0.join("checkpoint-two"),
                    authority: setup.authority.clone(),
                },
            )
            .await?,
    );
    assert_eq!(next.identity().previous_selection(), first.planned_selection());
    assert_ne!(next.identity().planned_selection(), first.planned_selection());
    let expected = next.identity().clone();
    let active = handle
        .activate_durable_native_service(
            "owner",
            &owner,
            setup.authority.clone(),
            next,
            p,
            expected.clone(),
        )
        .await?;
    assert_eq!(active.selection(), expected.planned_selection());
    assert_eq!(recovered.status(&setup.authority)?, Status::Committed);
    active
        .recovery_host()
        .host
        .transaction(|room| {
            assert!(room.catchup("accepted-after-checkpoint").is_ok());
            Ok(())
        })
        .await?;
    Ok(())
}
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn forty_durable_native_activation_modes_reopen_actual_target_and_take_fresh_epochs_without_losing_later_accepts()
-> TestResult {
    for profile in [(1, false), (2, false), (2, true), (3, false), (3, true)] {
        for atomic in [false, true] {
            for document in [false, true] {
                for review in [false, true] {
                    Box::pin(workflow(profile, atomic, (document, review))).await?;
                }
            }
        }
    }
    Ok(())
}
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn different_operational_copy_cannot_reuse_a_committed_checkpoint_even_with_identical_native_bytes()
-> TestResult {
    let setup = Box::pin(Setup::new((3, true), true, (true, true), true)).await?;
    let p = setup.proof().await?;
    let prepared = prepare(&setup, "checkpoint", &p).await?;
    let id = prepared.identity().clone();
    let active = setup
        .handle
        .activate_durable_native_service(
            "owner",
            &setup.owner,
            setup.authority.clone(),
            prepared.clone(),
            p,
            id,
        )
        .await?;
    let before = setup.ledger()?;
    let (auth, owner, _) = authentication()?;
    let other = prepare_log_generation_recovery_host(
        setup.source.operation("other")?,
        auth,
        setup.source.original_copy()?,
        &setup.source.original.info()?.identity,
        "owner",
        &owner,
    )
    .await?;
    let p = proof(&other, &owner, &setup.source).await?;
    let root = setup.source.directory.0.join("forbidden-other");
    assert!(
        other
            .prepare_durable_native_restart(
                "owner",
                &owner,
                prepared,
                &p,
                Options { root: root.clone(), authority: setup.authority.clone() }
            )
            .await
            .is_err()
    );
    assert!(!root.exists());
    assert_eq!(setup.ledger()?, before);
    drop(active);
    Ok(())
}
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn physical_target_change_after_prepare_refuses_before_epoch_and_keeps_new_native_data()
-> TestResult {
    let setup = Box::pin(Setup::new((3, true), true, (true, true), true)).await?;
    let p = setup.proof().await?;
    let prepared = prepare(&setup, "checkpoint", &p).await?;
    let id = prepared.identity().clone();
    let before = setup.ledger()?;
    setup.handle.host.transaction(|room| room.rotate_log_generation("owner", "later")).await?;
    let fresh = setup.handle.capture_recovery_state("owner", &setup.owner).await?.identity()?;
    assert!(
        setup
            .handle
            .activate_durable_native_service(
                "owner",
                &setup.owner,
                setup.authority.clone(),
                prepared,
                p,
                id
            )
            .await
            .is_err()
    );
    assert_eq!(setup.ledger()?, before);
    assert_eq!(
        setup.handle.capture_recovery_state("owner", &setup.owner).await?.identity()?,
        fresh
    );
    Ok(())
}
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn synced_without_lease_and_interrupted_publication_never_leave_an_unfenced_durable_target()
-> TestResult {
    use crate::server::generation_backup::durable::{Interruption, Point};
    for point in [Point::SourceChecked, Point::EpochWritten, Point::EpochSynced] {
        let setup = Box::pin(Setup::new((3, true), true, (true, true), true)).await?;
        let p = setup.proof().await?;
        let prepared = prepare(&setup, "checkpoint", &p).await?;
        let before = setup.ledger()?;
        assert!(
            crate::server::deployment_fence::activate_durable_native_generation(
                &setup.handle,
                "owner",
                &setup.authority,
                &prepared,
                &p,
                &Interruption { stop: Some(point), ..Interruption::default() }
            )
            .is_err()
        );
        if point == Point::SourceChecked {
            assert_eq!(setup.ledger()?, before);
            setup.handle.capture_recovery_state("owner", &setup.owner).await?;
            assert_eq!(prepared.status(&setup.authority)?, Status::Prepared);
        } else {
            assert_eq!(setup.ledger()?.len(), before.len() + 104);
            assert!(setup.handle.capture_recovery_state("owner", &setup.owner).await.is_err());
            assert_eq!(prepared.status(&setup.authority)?, Status::Committed);
        }
    }
    Ok(())
}
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn checkpoint_namespace_uncertainty_remains_retired_and_parallel_reads_do_not_share_seek_cursors()
-> TestResult {
    let setup = Box::pin(Setup::new((3, true), true, (true, true), true)).await?;
    let p = setup.proof().await?;
    let prepared = prepare(&setup, "checkpoint", &p).await?;
    std::thread::scope(|scope| {
        let jobs = (0..8)
            .map(|_| {
                let prepared = &prepared;
                let authority = &setup.authority;
                scope.spawn(move || {
                    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(20);
                    for _ in 0..20 {
                        loop {
                            match prepared.status(authority) {
                                Ok(Status::Prepared) => break,
                                Err(Error::Locked) => {
                                    assert!(std::time::Instant::now() < deadline);
                                    std::thread::yield_now();
                                }
                                other => panic!("unexpected actual status {other:?}"),
                            }
                        }
                    }
                })
            })
            .collect::<Vec<_>>();
        for job in jobs {
            job.join().expect("joined status reader");
        }
    });
    let owner = prepared.root().join(".owner");
    let moved = prepared.root().join(".old-owner");
    fs::rename(&owner, &moved)?;
    assert!(prepared.status(&setup.authority).is_err());
    fs::rename(&moved, &owner)?;
    assert!(prepared.status(&setup.authority).is_err());
    Ok(())
}

fn roundtrip(id: &Identity) -> TestResult<Identity> {
    Ok(serde_json::from_slice(&serde_json::to_vec(id)?)?)
}

mod checkpoint_epoch;
#[path = "durable_native_activation/faults.rs"]
mod faults;
#[path = "durable_native_activation/process.rs"]
mod process;
mod sealed_restart;

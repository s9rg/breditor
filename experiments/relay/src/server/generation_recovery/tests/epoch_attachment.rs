//! Future activation must fence clones taken while the genuine host was inactive.
use super::super::prepare_log_generation_recovery_host;
use super::source::{Source, TestResult, authentication};
use crate::{Error, server::RoomDeploymentAuthority};
use std::fs;

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn clones_taken_before_epoch_attachment_cannot_keep_an_unfenced_native_owner() -> TestResult {
    let source = Source::new((3, true), true, true, true)?;
    let (authentication, owner, _) = authentication()?;
    let handle = Box::pin(prepare_log_generation_recovery_host(
        source.operation("clone-epoch")?,
        authentication,
        source.original_copy()?,
        &source.original.info()?.identity,
        "owner",
        &owner,
    ))
    .await?;
    let earlier = handle.clone();
    earlier.capture_recovery_state("owner", &owner).await?;
    let binding = handle.host.room.lock().map_err(|_| "native owner")?.deployment_binding()?;
    let authority =
        RoomDeploymentAuthority::create(&source.directory.0.join("serving-authority"), &binding)?;
    let lease = authority.claim(&authority.current_selection()?)?;
    // Private attachment alone deliberately exposes no public activation route.
    crate::server::deployment_fence::attach_host(&handle.host, lease.clone())?;
    authority.claim(&lease.selection())?.close();
    assert!(matches!(handle.capture_recovery_state("owner", &owner).await, Err(Error::Lease)));
    assert!(matches!(earlier.capture_recovery_state("owner", &owner).await, Err(Error::Lease)));
    assert!(matches!(
        earlier
            .host
            .transaction(|room| room.grant("owner", "stale-clone-write", Some(crate::Role::Reader)))
            .await,
        Err(Error::Lease)
    ));
    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn a_different_actual_profile_cannot_attach_or_change_the_original_unfenced_host()
-> TestResult {
    let source = Source::new((3, true), true, true, true)?;
    let (authentication, owner, _) = authentication()?;
    let handle = Box::pin(prepare_log_generation_recovery_host(
        source.operation("binding-host")?,
        authentication,
        source.original_copy()?,
        &source.original.info()?.identity,
        "owner",
        &owner,
    ))
    .await?;
    let earlier = handle.clone();
    let before = handle.capture_recovery_state("owner", &owner).await?.identity()?;
    let other = Source::new((1, false), false, true, true)?;
    let operation = other.operation("different-profile")?;
    let binding = operation.room().deployment_binding()?;
    assert_ne!(binding, handle.host.room.lock().map_err(|_| "native owner")?.deployment_binding()?);
    let path = other.directory.0.join("serving-authority");
    let authority = RoomDeploymentAuthority::create(&path, &binding)?;
    let lease = authority.claim(&authority.current_selection()?)?;
    let ledger = fs::read(path.join("authority.log"))?;
    assert!(matches!(
        crate::server::deployment_fence::attach_host(&handle.host, lease),
        Err(Error::Contract("deployment native binding"))
    ));
    assert_eq!(fs::read(path.join("authority.log"))?, ledger);
    assert_eq!(handle.capture_recovery_state("owner", &owner).await?.identity()?, before);
    assert_eq!(earlier.capture_recovery_state("owner", &owner).await?.identity()?, before);
    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn a_new_current_lease_cannot_refresh_or_revive_a_retired_host_or_its_older_clones()
-> TestResult {
    let source = Source::new((3, true), true, true, true)?;
    let (authentication, owner, _) = authentication()?;
    let handle = Box::pin(prepare_log_generation_recovery_host(
        source.operation("no-refresh")?,
        authentication,
        source.original_copy()?,
        &source.original.info()?.identity,
        "owner",
        &owner,
    ))
    .await?;
    let earlier = handle.clone();
    let binding = handle.host.room.lock().map_err(|_| "native owner")?.deployment_binding()?;
    let path = source.directory.0.join("serving-authority");
    let authority = RoomDeploymentAuthority::create(&path, &binding)?;
    let first = authority.claim(&authority.current_selection()?)?;
    crate::server::deployment_fence::attach_host(&handle.host, first.clone())?;
    let replacement = authority.claim(&first.selection())?;
    let ledger = fs::read(path.join("authority.log"))?;
    assert!(matches!(
        crate::server::deployment_fence::attach_host(&handle.host, replacement.clone()),
        Err(Error::Contract("host deployment already attached"))
    ));
    assert_eq!(fs::read(path.join("authority.log"))?, ledger);
    assert!(matches!(handle.capture_recovery_state("owner", &owner).await, Err(Error::Lease)));
    assert!(matches!(earlier.capture_recovery_state("owner", &owner).await, Err(Error::Lease)));
    replacement.close();
    Ok(())
}

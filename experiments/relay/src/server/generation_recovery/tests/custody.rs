//! Actual directory locks must outlive a dropped async caller and every public handle clone.
use super::super::prepare_log_generation_recovery_host;
use super::source::{Source, TestResult, authentication};
use crate::{Error, log::generations::GenerationDirectory};
use std::time::Duration;

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn a_cancelled_native_transaction_retains_parent_and_native_recovery_leases_until_worker_finishes()
-> TestResult {
    let source = Source::new((3, true), true, true, true)?;
    let operation = source.operation("cancelled")?;
    let root = operation.root().to_owned();
    let native: serde_json::Value =
        serde_json::from_slice(&std::fs::read(root.join(".native.json"))?)?;
    let native = root.join(native["directory"].as_str().ok_or("native directory")?);
    let rasters: serde_json::Value =
        serde_json::from_slice(&std::fs::read(root.join(".rasters.json"))?)?;
    let rasters = root.join(rasters["directory"].as_str().ok_or("raster directory")?);
    let binding = source.original.info()?.identity.assets.binding;
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
    let host = handle.host.clone();
    let (started_tx, started_rx) = tokio::sync::oneshot::channel();
    let (release_tx, release_rx) = std::sync::mpsc::channel();
    let job = tokio::spawn(async move {
        host.transaction(move |room| {
            let _ = started_tx.send(());
            release_rx
                .recv_timeout(Duration::from_secs(10))
                .map_err(|_| Error::Contract("test worker release timeout"))?;
            room.grant("owner", "detached-write", Some(crate::Role::Reader))?;
            Ok(())
        })
        .await
    });
    tokio::time::timeout(Duration::from_secs(10), started_rx).await??;
    drop(handle);
    job.abort();
    assert!(job.await.is_err());
    assert!(matches!(GenerationDirectory::open(&root), Err(Error::Locked)));
    assert!(matches!(GenerationDirectory::open(&native), Err(Error::Locked)));
    assert!(matches!(
        crate::assets::AssetStore::open_retained(&rasters, &binding),
        Err(Error::Locked)
    ));
    release_tx.send(())?;
    tokio::time::timeout(Duration::from_secs(10), async {
        loop {
            match crate::OperationalLogGenerationServerRoom::resume(
                &root,
                &source.original,
                &source.original.info()?.identity,
                super::source::POLICY,
                "owner",
            ) {
                Ok(mut current) => {
                    assert!(current.room().catchup("detached-write").is_ok());
                    current.check_live_source(&source.original, "owner")?;
                    break;
                }
                Err(Error::Locked) => tokio::time::sleep(Duration::from_millis(1)).await,
                Err(error) => return Err(error),
            }
        }
        Ok::<_, Error>(())
    })
    .await??;
    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn native_and_raster_owners_cannot_be_swapped_for_byte_identical_other_recoveries()
-> TestResult {
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
    let mut other = source.operation("two")?;
    let custody = handle.host.generation_custody.as_ref().ok_or("actual custody")?;
    let assets = handle.host.assets.as_ref().ok_or("actual rasters")?;
    {
        let mut assets = assets.lock().map_err(|_| "raster owner")?;
        assert!(
            custody.check_source(other.room_mut(), &mut assets, &source.original, "owner").is_err()
        );
    }
    {
        let mut room = handle.host.room.lock().map_err(|_| "room owner")?;
        assert!(
            custody.check_source(&mut room, other.assets_mut(), &source.original, "owner").is_err()
        );
    }
    other.check_live_source(&source.original, "owner")?;
    handle.capture_recovery_state("owner", &owner).await?;
    Ok(())
}

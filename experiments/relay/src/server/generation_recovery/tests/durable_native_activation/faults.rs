//! Rollback beyond the original source, and cancellation through actual commit ownership.
use super::*;
use std::{path::PathBuf, time::Duration};
fn captured_files(root: &Path) -> TestResult<Vec<(PathBuf, Vec<u8>)>> {
    let mut rows = Vec::new();
    for entry in fs::read_dir(root)? {
        let entry = entry?;
        if entry.file_type()?.is_dir() {
            rows.extend(captured_files(&entry.path())?);
        } else if entry.file_name() != ".owner" {
            assert!(entry.file_type()?.is_file());
            rows.push((entry.path(), fs::read(entry.path())?));
        }
    }
    Ok(rows)
}
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn original_source_ancestry_does_not_cover_a_rollback_below_the_committed_target_checkpoint()
-> TestResult {
    let setup = Box::pin(Setup::new((3, true), true, (true, true), true)).await?;
    let target = setup.source.directory.0.join("target");
    let native: serde_json::Value =
        serde_json::from_slice(&fs::read(target.join(".native.json"))?)?;
    let native = target.join(native["directory"].as_str().ok_or("actual native directory")?);
    let old = captured_files(&native)?;
    setup
        .handle
        .host
        .transaction(|room| {
            room.grant("owner", "accepted-before-activation", Some(crate::Role::Reader))
        })
        .await?;
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
    drop(active);
    drop(setup.handle);
    // Rewrite only this test's closed private native fixture in place; original
    // inodes and operational controls remain, but an accepted later event is lost.
    for (path, bytes) in old {
        fs::write(path, bytes)?;
    }
    let (handle, owner) = Box::pin(reopen(&setup.source, &target)).await?;
    let p = proof(&handle, &owner, &setup.source).await?;
    let rollback = p.identity();
    assert_ne!(rollback.server, prepared.identity().current().server);
    let root = setup.source.directory.0.join("forbidden-rollback");
    assert!(
        handle
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
    assert_eq!(fs::read(setup.source.directory.0.join("authority/authority.log"))?, before);
    assert_eq!(handle.capture_recovery_state("owner", &owner).await?.identity()?, rollback);
    Ok(())
}
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn cancellation_at_each_real_commit_stage_retains_checkpoint_source_and_target_until_worker_settles()
-> TestResult {
    use crate::server::generation_backup::durable::{Barrier, Interruption, Point};
    for point in [Point::SourceChecked, Point::EpochWritten, Point::EpochSynced] {
        let setup = Box::pin(Setup::new((3, true), true, (true, true), true)).await?;
        let p = setup.proof().await?;
        let prepared = prepare(&setup, "checkpoint", &p).await?;
        let expected = prepared.identity().clone();
        let root = prepared.root().to_owned();
        let target = setup.source.directory.0.join("target");
        let (entered, ready) = std::sync::mpsc::channel();
        let (release, released) = std::sync::mpsc::channel();
        let held = setup.handle.clone();
        let authority = setup.authority.clone();
        let worker = tokio::task::spawn_blocking(move || {
            crate::server::deployment_fence::activate_durable_native_generation(
                &held,
                "owner",
                &authority,
                &prepared,
                &p,
                &Interruption {
                    barrier: Some(Barrier {
                        point,
                        entered,
                        release: std::sync::Mutex::new(released),
                    }),
                    ..Interruption::default()
                },
            )
        });
        let caller = tokio::spawn(worker);
        tokio::task::spawn_blocking(move || ready.recv_timeout(Duration::from_secs(15))).await??;
        drop(setup.handle);
        caller.abort();
        assert!(caller.await.is_err());
        assert!(matches!(
            crate::log::generations::GenerationDirectory::open(&root),
            Err(Error::Locked)
        ));
        assert!(matches!(
            crate::log::generations::GenerationDirectory::open(&target),
            Err(Error::Locked)
        ));
        release.send(())?;
        tokio::time::timeout(Duration::from_secs(15), async {
            loop {
                match Prepared::open(&root, &expected, setup.intent.clone()) {
                    Ok(cold) => {
                        assert_eq!(cold.status(&setup.authority)?, Status::Committed);
                        break;
                    }
                    Err(Error::Locked) => tokio::time::sleep(Duration::from_millis(2)).await,
                    Err(error) => return Err(error),
                }
            }
            Ok::<_, Error>(())
        })
        .await??;
        assert_eq!(setup.authority.current_selection()?, *expected.planned_selection());
    }
    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn an_unreferenced_raster_accepted_after_the_original_source_is_still_required_by_cold_restart()
-> TestResult {
    let setup = Box::pin(Setup::new((3, true), true, (true, true), true)).await?;
    let target = setup.source.directory.0.join("target");
    let data: serde_json::Value = serde_json::from_slice(&fs::read(target.join(".rasters.json"))?)?;
    let raster = target.join(data["directory"].as_str().ok_or("raster owner")?);
    let before = captured_files(&raster)?
        .into_iter()
        .map(|(path, _)| path)
        .collect::<std::collections::BTreeSet<_>>();
    let assets = setup.handle.host.assets.clone().ok_or("actual raster owner")?;
    setup
        .handle
        .host
        .transaction(move |room| {
            let mut bytes = std::io::Cursor::new(Vec::new());
            image::DynamicImage::new_rgb8(7, 8)
                .write_to(&mut bytes, image::ImageFormat::Png)
                .map_err(|_| Error::Contract("test raster"))?;
            let bytes = bytes.into_inner();
            room.put_asset(
                "owner",
                &mut *assets.lock().map_err(|_| Error::NeedsRecovery)?,
                crate::assets::prepare_asset(&crate::assets::asset_id(&bytes), "image/png", bytes)?,
            )
        })
        .await?;
    let added = captured_files(&raster)?
        .into_iter()
        .map(|(path, _)| path)
        .filter(|path| !before.contains(path))
        .collect::<Vec<_>>();
    assert!(!added.is_empty());
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
    let ledger = setup.ledger()?;
    drop(active);
    drop(setup.handle);
    // Only the newly published raster in this test's private fixture is removed.
    for path in added {
        assert!(path.starts_with(&raster));
        fs::remove_file(path)?;
    }
    let (handle, owner) = Box::pin(reopen(&setup.source, &target)).await?;
    let p = proof(&handle, &owner, &setup.source).await?;
    let root = setup.source.directory.0.join("forbidden-missing-raster");
    assert!(
        handle
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
    assert_eq!(fs::read(setup.source.directory.0.join("authority/authority.log"))?, ledger);
    Ok(())
}

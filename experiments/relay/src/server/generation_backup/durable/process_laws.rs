//! Real terminated worker and cancelled future, never manufactured commit metadata.
use super::*;
use crate::server::generation_backup::durable::Barrier;
use std::{
    io::Write,
    process::{Command, Stdio},
    sync::{Mutex, mpsc},
    time::{Duration, Instant},
};

fn persist_outside(live: &Live, identity: &Identity) -> TestResult {
    use std::os::unix::fs::OpenOptionsExt;
    let mut file = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .mode(0o600)
        .open(live.directory.0.join("outside-choice.json"))?;
    file.write_all(&serde_json::to_vec(identity)?)?;
    file.sync_all()?;
    fs::File::open(&live.directory.0)?.sync_all()?;
    Ok(())
}

#[test]
fn crashed_handover_worker() -> TestResult {
    let Some(root) = std::env::var_os("BREDITOR_HANDOVER_CRASH_ROOT") else {
        return Ok(());
    };
    let root: std::path::PathBuf = root.into();
    if root.parent().ok_or("test root parent")?.canonicalize()?
        != std::env::temp_dir().canonicalize()?
        || !fs::symlink_metadata(&root)?.is_dir()
    {
        return Err("owned test root required".into());
    }
    let nonce = root
        .file_name()
        .and_then(|name| name.to_str())
        .and_then(|name| name.strip_prefix("breditor-live-generation-fence-"))
        .ok_or("test root prefix")?;
    crate::credentials::hash(nonce)?;
    let point = match std::env::var("BREDITOR_HANDOVER_CRASH_POINT")?.as_str() {
        "before" => Point::SourceChecked,
        "after" => Point::EpochSynced,
        _ => return Err("explicit crash point".into()),
    };
    let runtime =
        tokio::runtime::Builder::new_multi_thread().worker_threads(2).enable_all().build()?;
    runtime.block_on(async {
        let live = Live::in_directory(Directory(root)).await?;
        let prepared = live.prepare("intent").await?;
        persist_outside(&live, prepared.identity())?;
        let stop =
            Interruption { stop: Some(point), exit_process: true, ..Interruption::default() };
        deployment_fence::seal_prepared(&live.handle.host, "owner", &prepared, &stop)?;
        Err("worker did not terminate at the selected actual fence phase".into())
    })
}

#[test]
fn abrupt_process_exit_before_and_after_sync_has_exactly_one_cold_interpretation() -> TestResult {
    for (phase, expected) in [("before", Status::Prepared), ("after", Status::Sealed)] {
        let directory = Directory::new()?;
        let log = fs::File::create(directory.0.join("child.log"))?;
        let mut child = Command::new(std::env::current_exe()?)
            .args(["--exact","server::generation_backup::tests::durable_source_handover::process_laws::crashed_handover_worker","--nocapture","--test-threads=1"])
            .env("BREDITOR_HANDOVER_CRASH_ROOT",&directory.0).env("BREDITOR_HANDOVER_CRASH_POINT",phase)
            .stdout(Stdio::from(log.try_clone()?)).stderr(Stdio::from(log)).spawn()?;
        let deadline = Instant::now() + Duration::from_secs(30);
        let status = loop {
            if let Some(status) = child.try_wait()? {
                break status;
            }
            if Instant::now() >= deadline {
                child.kill()?;
                child.wait()?;
                return Err("crash worker deadline".into());
            }
            std::thread::sleep(Duration::from_millis(10));
        };
        assert_eq!(
            status.code(),
            Some(77),
            "{}",
            fs::read_to_string(directory.0.join("child.log"))?
        );
        let identity: Identity =
            serde_json::from_slice(&fs::read(directory.0.join("outside-choice.json"))?)?;
        let authority = RoomDeploymentAuthority::open_at_least(
            &directory.authority(),
            identity.previous_selection(),
        )?;
        let ledger = fs::read(directory.authority().join("authority.log"))?;
        let prepared = Prepared::open(&directory.0.join("intent"), &identity)?;
        assert_eq!(prepared.status(&authority)?, expected);
        assert_eq!(
            prepared.source_backup().to_bytes()?,
            fs::read(directory.0.join("intent/source.backup"))?
        );
        assert_eq!(
            authority.current_selection()?,
            if expected == Status::Prepared {
                identity.previous_selection().clone()
            } else {
                identity.planned_selection().clone()
            }
        );
        assert_eq!(fs::read(directory.authority().join("authority.log"))?, ledger);
    }
    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn cancelled_wait_keeps_source_and_store_custody_until_the_actual_fence_settles() -> TestResult
{
    let live = Live::new().await?;
    let prepared = live.prepare("intent").await?;
    let identity = prepared.identity().clone();
    let root = prepared.root().to_owned();
    let host = live.handle.host.clone();
    let (entered_tx, entered_rx) = mpsc::channel();
    let (release_tx, release_rx) = mpsc::channel();
    let stop = Interruption {
        barrier: Some(Barrier {
            point: Point::SourceChecked,
            entered: entered_tx,
            release: Mutex::new(release_rx),
        }),
        ..Interruption::default()
    };
    let waiting = tokio::spawn(async move {
        tokio::task::spawn_blocking(move || {
            deployment_fence::seal_prepared(&host, "owner", &prepared, &stop)?;
            Ok::<_, Error>(prepared)
        })
        .await
        .map_err(|_| Error::NeedsRecovery)?
    });
    entered_rx.recv_timeout(Duration::from_secs(5))?;
    assert!(matches!(live.authority.current_selection(), Err(Error::Locked)));
    assert!(matches!(Prepared::open(&root, &identity), Err(Error::Locked)));
    waiting.abort();
    let Err(cancelled) = waiting.await else {
        return Err("awaiting task was not cancelled".into());
    };
    assert!(cancelled.is_cancelled());
    assert!(matches!(live.authority.current_selection(), Err(Error::Locked)));
    release_tx.send(())?;
    let deadline = tokio::time::Instant::now() + Duration::from_secs(5);
    let cold = loop {
        match Prepared::open(&root, &identity) {
            Ok(cold) => break cold,
            Err(Error::Locked) if tokio::time::Instant::now() < deadline => {
                tokio::time::sleep(Duration::from_millis(2)).await;
            }
            Err(error) => return Err(error.into()),
        }
    };
    assert_eq!(cold.status(&live.authority)?, Status::Sealed);
    assert_eq!(live.authority.current_selection()?, *identity.planned_selection());
    assert!(live.handle.capture("owner", &live.owner).await.is_err());
    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn observed_namespace_uncertainty_retires_the_warm_intent_even_if_the_old_owner_reappears()
-> TestResult {
    let live = Live::new().await?;
    let prepared = live.prepare("intent").await?;
    let owner = prepared.root().join(".owner");
    let held = live.directory.0.join("held-owner");
    let bytes = fs::read(&owner)?;
    fs::rename(&owner, &held)?;
    fs::write(&owner, &bytes)?;
    assert!(prepared.status(&live.authority).is_err());
    fs::remove_file(&owner)?;
    fs::rename(&held, &owner)?;
    assert!(matches!(prepared.status(&live.authority), Err(Error::NeedsRecovery)));
    let id = prepared.identity().clone();
    let before = live.ledger()?;
    assert!(live.handle.seal_prepared_handover("owner", &live.owner, prepared, &id).await.is_err());
    assert_eq!(live.ledger()?, before);
    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn parallel_read_only_status_calls_cannot_corrupt_or_retire_an_immutable_intent() -> TestResult
{
    let live = Live::new().await?;
    let prepared = std::sync::Arc::new(live.prepare("intent").await?);
    let before = live.ledger()?;
    std::thread::scope(|scope| {
        let mut work = Vec::new();
        for _ in 0..8 {
            let prepared = &prepared;
            let authority = &live.authority;
            work.push(scope.spawn(move || {
                let deadline = Instant::now() + Duration::from_secs(15);
                let mut completed = 0;
                while completed < 30 {
                    assert!(Instant::now() < deadline, "concurrent status deadline");
                    match prepared.status(authority) {
                        Ok(Status::Prepared) => completed += 1,
                        Err(Error::Locked) => std::thread::yield_now(),
                        result => panic!("read-only status changed healthy custody: {result:?}"),
                    }
                }
            }));
        }
        for worker in work {
            worker.join().expect("parallel status worker");
        }
    });
    assert_eq!(prepared.status(&live.authority)?, Status::Prepared);
    assert_eq!(live.ledger()?, before);
    assert_eq!(
        live.handle.capture("owner", &live.owner).await?.to_bytes()?,
        prepared.source_backup().to_bytes()?
    );
    Ok(())
}
